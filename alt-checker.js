import DiscordBasePlugin from './discord-base-plugin.js';
import DBLog from './db-log.js';
import Sequelize, { NOW, Op, QueryTypes } from 'sequelize';
import axios from 'axios';
import { request, gql } from 'graphql-request';

const delay = (ms) => new Promise((res, rej) => setTimeout(res));

const RETURN_TYPE = {
    NO_MATCH: 0,
    PLAYER_NOT_FOUND: 1
}
export default class AltChecker extends DiscordBasePlugin {
    static get description() {
        return '';
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            commandPrefix: {
                required: false,
                description: 'Command name to get message.',
                default: '!altcheck'
            },
            channelID: {
                required: true,
                description: 'The ID of the channel to log data.',
                default: '',
                example: '667741905228136459'
            },
            kickIfAltDetected: {
                required: false,
                description: 'Will kick a player if an ALT has been detected on his IP.',
                default: false
            },
            onlyKickOnlineAlt: {
                required: false,
                description: 'Checks if a player with the same IP is already connected to server and kicks the player that is trying to connect',
                default: true
            },
            kickReason: {
                required: false,
                description: 'Reason of the kick due to an ALT account being detected',
                default: 'ALT detected. Protection kick',
            },
            battleMetricsApiKey: {
                required: true,
                description: 'API key for BattleMetrics',
                default: '',
                example: 'YOUR_BATTLEMETRICS_API_KEY'
            },
            battleMetricsServerId: {
                required: true,
                description: 'BattleMetrics server ID to check bans against',
                default: '',
                example: 'YOUR_SERVER_ID'
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.onMessage = this.onMessage.bind(this);
        this.onDiscordMessage = this.onDiscordMessage.bind(this);
        this.doAltCheck = this.doAltCheck.bind(this);
        this.onChatMessage = this.onChatMessage.bind(this);
        this.onPlayerConnected = this.onPlayerConnected.bind(this);
        this.getPlayerByName = this.getPlayerByName.bind(this);
        this.getPlayersByUsernameDatabase = this.getPlayersByUsernameDatabase.bind(this);
        this.predefinedIPs = ['71.125.73.88'];

        this.DBLogPlugin;

        this.warn = (steamid, msg) => { this.server.rcon.warn(steamid, msg); };
        this.kick = (eosID, reason) => { this.server.rcon.execute(`AdminKick "${eosID}" ${reason}`); };
    }

    async mount() {
        this.DBLogPlugin = this.server.plugins.find(p => p instanceof DBLog);
        if (!this.DBLogPlugin) return;

        this.options.discordClient.on('message', this.onDiscordMessage);
        this.server.on('CHAT_MESSAGE', this.onChatMessage);
        this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
    }

    async unmount() {
    }

    async onDiscordMessage(message) {
        if (message.author.id === this.options.discordClient.user.id) return;

        const res = await this.onMessage(message.content);

        if (res === RETURN_TYPE.NO_MATCH) return;

        this.verbose(1, `${message.author.username}#${message.author.discriminator} has requested a discord alt-check: ${message.content}`)

        const embed = await this.generateDiscordEmbed(res);
        message.channel.send({ embed: embed });
    }

    async onChatMessage(message) {
        if (message.chat != 'ChatAdmin') return;

        const res = await this.onMessage(message.message);

        if (res == RETURN_TYPE.NO_MATCH) return;

        this.verbose(1, `${message.player.name} has requested an in-game alt-check: ${message.message}`)

        if (!res || res == RETURN_TYPE.PLAYER_NOT_FOUND || res.length == 0) {
            this.warn(message.eosID, `Unable to find player`);
            return;
        }

        let warningMessage = ""

        if (res.length > 1) {
            warningMessage += `Alts for IP: ${res[0].lastIP}\n`

            for (let altK in res) {
                const alt = res[altK];

                warningMessage += `\n${+altK + 1}. ${alt.lastName}`
            }
        } else {
            warningMessage += `No Alts found!`
        }

        this.warn(message.eosID, warningMessage);
    }

    async onMessage(message) {
        const messageContent = message
        const regex = new RegExp(`^${this.options.commandPrefix} (?:(?<steamID>\\d{17})|(?<eosID>[\\w\\d]{32})|(?<lastIP>(?:\\d{1,3}\\.){3}\\d{1,3})|(?<playerName>.+))$`, 'i');
        const matched = messageContent.match(regex)

        if (!matched) {
            this.verbose(1, `"${message}" will not be processed.`)
            return RETURN_TYPE.NO_MATCH;
        }
        this.verbose(1, `"${message}" has been recognized as a known command and will be processed.`)

        const res = await this.doAltCheck(matched.groups)

        return res;
    }

    async onPlayerConnected(info) {
        await delay(3000);

        if (this.predefinedIPs.includes(info.ip)) {
            // Kick the player immediately if their IP matches one of the predefined IPs
            this.kick(info.eosID, "Nice Try.");

            // Send a test logging message to Discord
            const kickLogMessage = {
                embed: {
                    title: `Player Kicked for Restricted IP`,
                    description: `Player with EOS ID: ${info.eosID} has been kicked for using a restricted IP: ${info.ip}. This is a test for the new plugin.`,
                    color: 'FF0000', // Red color for the message embed
                }
            };
            await this.sendDiscordMessage(kickLogMessage);

            return; // Stop further processing
        }
        const res = await this.doAltCheck({ lastIP: info.ip })

        if (!res) return;

        if (res.length <= 1 || res == RETURN_TYPE.PLAYER_NOT_FOUND) return;

        const embed = await this.generateDiscordEmbed(res);
        embed.title = `Alts found for connected player: ${info.player.name}`
        embed.description = this.getFormattedUrlsPart(info.player.steamID, info.eosID) + "\n​";

        let shouldKick = false;

        if (this.options.kickIfAltDetected) {
            shouldKick = true;

            const onlineAlt = this.server.players.find(p => p.eosID != info.player.eosID && res.find(dbP => dbP.eosID == p.eosID))
            if (this.options.onlyKickOnlineAlt && !onlineAlt)
                shouldKick = false;

            if (shouldKick)
                this.kick(info.eosID, this.options.kickReason)
        }

        embed.fields.unshift({
            name: 'Player Kicked?',
            value: shouldKick ? 'YES' : 'NO'
        })

        await this.sendDiscordMessage({ embed: embed });
    }

    async fetchBattleMetricsBans(identifier) {
        try {
            const response = await axios.get(`https://api.battlemetrics.com/bans`, {
                headers: {
                    Authorization: `Bearer ${this.options.battleMetricsApiKey}`
                },
                params: {
                    'filter[search]': identifier
                }
            });

            const bans = response.data.data;
            const totalBans = bans.filter(ban => ban.type === 'ban').length;
            const cheaterBans = bans.filter(ban => ban.type === 'ban' && ban.attributes.reason.includes('Cheating')).length;

            return { totalBans, cheaterBans };
        } catch (error) {
            this.verbose(1, `Error fetching bans from BattleMetrics: ${error.message}`);
            return { totalBans: 0, cheaterBans: 0 };
        }
    }

async fetchCommunityBanListInfo(steamID) {
    try {
        const query = gql`
            query Search($id: String!) {
                steamUser(id: $id) {
                    id
                    name
                    avatarFull
                    reputationPoints
                    riskRating
                    reputationRank
                    lastRefreshedInfo
                    lastRefreshedReputationPoints
                    lastRefreshedReputationRank
                    activeBans: bans(orderBy: "created", orderDirection: DESC, expired: false) {
                        edges {
                            cursor
                            node {
                                id
                            }
                        }
                    }
                    expiredBans: bans(orderBy: "created", orderDirection: DESC, expired: true) {
                        edges {
                            cursor
                            node {
                                id
                            }
                        }
                    }
                }
            }
        `;

        const data = await request('https://communitybanlist.com/graphql', query, { id: steamID });

        if (!data.steamUser) {
            this.verbose(2, `Player (Steam ID: ${steamID}) is not listed in the Community Ban List.`);
            return null;
        }

        return data.steamUser;
    } catch (error) {
        this.verbose(1, `Failed to fetch Community Ban List data for Steam ID: ${steamID}`, error);
        return null;
    }
}
async generateDiscordEmbed(res) {
    let embed;

    if (!res || res == RETURN_TYPE.PLAYER_NOT_FOUND || res.length == 0) {
        embed = {
            title: `Unable to find player`,
            description: `Player hasn't been found in the database!`,
            color: 'ff9900',
        }
    } else if (res.length > 1) {
        embed = {
            title: `Alts for IP: ${res[0].lastIP}`,
            color: 'FF0000',
            fields: [{
                name: 'IP',
                value: res[0].lastIP,
                inline: true
            }]
        }

        for (let altK in res) {
            const alt = res[altK];
            const onlinePlayer = this.server.players.find(p => p.eosID === alt.eosID)
            const isOnlineText = onlinePlayer ? `YES\n**Team: **${onlinePlayer.teamID} (${onlinePlayer.role.split('_')[0]})` : 'NO';

            const banData = await this.fetchBattleMetricsBans(alt.eosID);
            let cblInfo = '';

            if (this.options.showCBLInfo) {
                const cblData = await this.fetchCommunityBanListInfo(alt.steamID);
                if (cblData) {
                    cblInfo = `\n**Reputation Points: **${cblData.reputationPoints}\n**Risk Rating: **${cblData.riskRating} / 10\n**Reputation Rank: **#${cblData.reputationRank}\n**Active Bans: **${cblData.activeBans.edges.length}\n**Expired Bans: **${cblData.expiredBans.edges.length}`;
                } else {
                    cblInfo = '\n**Player not found on Community Ban List**';
                }
            }

            if (this.options.enableCheaterAltKicks && banData.cheaterBans > 0) {
                // Kick the cheater or their alt
                this.kick(alt.eosID, "Cheater ALT detected. Protection kick");

                // Send a message to the admin chat
                const adminChannel = this.options.discordClient.channels.cache.get(this.options.adminChatChannelID);
                if (adminChannel) {
                    adminChannel.send(`Cheater ALT detected and kicked: ${alt.lastName}\nBattleMetrics Profile: ${this.getBattlemetricsRconUrl(alt.eosID)}`);
                }
            }

            embed.fields.push({
                name: `​\n${+altK + 1}. ${alt.lastName}`,
                value: `${this.getFormattedUrlsPart(alt.steamID, alt.eosID)}\n**SteamID: **\`${alt.steamID}\`\n**EOS ID: **\`${alt.eosID}\`\n**Is Online: **${isOnlineText}\n**Bans: **${banData.totalBans}${this.options.showCheaterBans ? `\n**Cheater Bans: **${banData.cheaterBans > 0 ? 'Yes' : 'No'}` : ''}${cblInfo}`,
                inline: false
            });
        }

        // Ensure description field is set
        if (!embed.description) {
            embed.description = "Alts found.";
        }
    } else {
        this.verbose(1, 'No alts found', res)
        const mainPlayer = res[0];
        const banData = await this.fetchBattleMetricsBans(mainPlayer.eosID);
        let cblFields = [];
        let cblInfo = '';

        if (this.options.showCBLInfo) {
            const cblData = await this.fetchCommunityBanListInfo(mainPlayer.steamID);
            if (cblData) {
                cblFields = [
                    { name: 'Reputation Points', value: `${cblData.reputationPoints}`, inline: true },
                    { name: 'Risk Rating', value: `${cblData.riskRating} / 10`, inline: true },
                    { name: 'Reputation Rank', value: `#${cblData.reputationRank}`, inline: true },
                    { name: 'Active Bans', value: `${cblData.activeBans.edges.length}`, inline: true },
                    { name: 'Expired Bans', value: `${cblData.expiredBans.edges.length}`, inline: true }
                ];
            } else {
                cblInfo = 'Player not found on Community Ban List';
            }
        }

        if (this.options.enableCheaterAltKicks && banData.cheaterBans > 0) {
            // Kick the cheater or their alt
            this.kick(mainPlayer.eosID, "Cheater ALT detected. Protection kick");

            // Send a message to the admin chat
            const adminChannel = this.options.discordClient.channels.cache.get(this.options.adminChatChannelID);
            if (adminChannel) {
                adminChannel.send(`Cheater ALT detected and kicked: ${mainPlayer.lastName}\nBattleMetrics Profile: ${this.getBattlemetricsRconUrl(mainPlayer.eosID)}`);
            }
        }

        embed = {
            title: `${mainPlayer.lastName} doesn't have alts!`,
            color: '00FF00',
            description: this.getFormattedUrlsPart(mainPlayer.steamID, mainPlayer.eosID),
            fields: [
                { name: 'SteamID', value: `${mainPlayer.steamID}`, inline: true },
                { name: 'EOSID', value: `${mainPlayer.eosID}`, inline: true },
                { name: 'Name', value: `${mainPlayer.lastName}`, inline: true },
                { name: 'IP', value: `${mainPlayer.lastIP}`, inline: true },
                { name: 'Bans', value: `${banData.totalBans}`, inline: true },
                { name: 'Cheater Bans', value: `${this.options.showCheaterBans ? `${banData.cheaterBans > 0 ? 'Yes' : 'No'}` : 'N/A'}`, inline: true },
                { name: 'Community Ban List Info', value: '--------------------------------', inline: false },
                ...cblFields
            ]
        };

        if (!cblData) {
            embed.fields.push({ name: 'Community Ban List Info', value: cblInfo, inline: false });
        }
    }

    return embed;
}
    async doAltCheck(matchGroups) {
        let condition;
        let IP;

        for (let group in matchGroups) {
            if (!matchGroups[group]) continue;
            let groupOverride = group;

            if (groupOverride == 'playerName') {
                const foundPlayer = await this.getPlayerByName(matchGroups[groupOverride])
                if (!foundPlayer) return RETURN_TYPE.PLAYER_NOT_FOUND;

                groupOverride = 'eosID';
                matchGroups[groupOverride] = foundPlayer.eosID;
            }

            condition = { [groupOverride]: matchGroups[groupOverride] }
            if (groupOverride == 'lastIP')
                IP = matchGroups[groupOverride];
            break;
        }

        if (!IP) {
            const ipLookup = await this.DBLogPlugin.models.Player.findOne({
                where: condition
            })
            IP = ipLookup?.lastIP;

            if (!IP) return RETURN_TYPE.PLAYER_NOT_FOUND;
        }

        const res = await this.DBLogPlugin.models.Player.findAll({
            where: {
                lastIP: IP
            }
        })

        if (!res || res.length == 0) return RETURN_TYPE.PLAYER_NOT_FOUND;

        return res.map(r => r.dataValues);
    }

    async getPlayerByName(name) {
        const onlineRes = this.server.players.find(p => p.name === name || p.name.match(new RegExp(name, 'i')));

        if (onlineRes)
            return onlineRes

        const dbRes = (await this.getPlayersByUsernameDatabase(name)).map(p => p.dataValues).map(p => ({
            name: p.lastName,
            eosID: p.eosID,
            steamID: p.steamID,
            ip: p.lastIP
        }))

        return dbRes[0];
    }

    getFormattedUrlsPart(steamID, eosID) {
        return `[Steam](https://steamcommunity.com/profiles/${steamID}) | [BattleMetrics](${this.getBattlemetricsRconUrl(eosID)}) | [CBL](https://communitybanlist.com/search/${steamID})`
    }

    getBattlemetricsRconUrl(eosID) {
        return `https://www.battlemetrics.com/rcon/players?filter%5Bsearch%5D=${eosID}&filter%5Bservers%5D=false&filter%5BplayerFlags%5D=&sort=-lastSeen&showServers=true&method=quick&redirect=1`
    }

    async getPlayersByUsernameDatabase(username) {
        return await this.DBLogPlugin.models.Player.findAll({
            where: { lastName: { [Op.like]: `%${username}%` }, eosID: { [Op.not]: null } },
            limit: 2,
            group: ['eosID']
        });
    }
}