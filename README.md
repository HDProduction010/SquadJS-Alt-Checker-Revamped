# AltChecker Plugin

The AltChecker plugin, originally developed by JetDave, has been revamped into a  Discord and game server integration tool. This refactored version was created to detect alternate accounts, identify cheater bans, and efficiently managing player interactions. By integrating BattleMetrics and the Community Ban List, the updated plugin offers better alt-checking capabilities, ensuring a more secure and well-regulated environment.

## Features

- Check for alternate accounts based on IP addresses.
- Fetch and display ban information from BattleMetrics.
- Fetch and display reputation and ban information from the Community Ban List.
- Configurable options for displaying Community Ban List information and cheater bans.
- Automatically kick cheaters or their alts and notify admins.



### Prerequisites

- Node.js installed on your server.
- A Discord bot token.
- BattleMetrics API key.
- Community Ban List access.

```json
{
    "plugin": "AltChecker",
    "enabled": true,
    "discordClient": "discord",
    "commandPrefix": "!altcheck",
    "channelID": "your_discord_channel_id",
    "kickIfAltDetected": false,
    "onlyKickOnlineAlt": true,
    "kickReason": "ALT detected. Protection kick",
    "battleMetricsApiKey": "your_battlemetrics_api_key",
    "battleMetricsServerId": "your_battlemetrics_server_id",
    "showCBLInfo": true,
    "showCheaterBans": true,
    "enableCheaterAltKicks": true,
    "roleID": "",
    "rolePingForCheaterAlt": true,
    "enableDoubleAltPings": true,
    "adminChatChannelID": "your_admin_chat_channel_id"
}
```

### Obtaining API Key

#### BattleMetrics API Key

To get a BattleMetrics API key:

1. Sign in to your [BattleMetrics account](https://www.battlemetrics.com/).
2. Click on the user icon next to the logout button.
   ![User Icon](https://i.imgur.com/nOCza7P.png)
3. Select "Account Management" on the right side.
   ![BattleMetrics Account Management](https://i.imgur.com/n5oHRbO.png)
4. Scroll to the bottom of the page to the "Personal Access Tokens" section.
5. Click on "Manage Access Tokens".
   ![Manage Access Tokens](https://i.imgur.com/9Vf8UaE.png)
6. Create a new token and give it a name.
   ![Create Token](https://i.imgur.com/1CFFqYD.png)
7. Ensure the token has the view, search and list bans permission.

   <img src="https://i.imgur.com/HgM7xuL.png" alt="Token Permissions." width="200" />
9. Copy the generated token and use it in your `config.json`.


#### BattleMetrics Server ID

To find your BattleMetrics server ID:

1. Log in to your [BattleMetrics account](https://www.battlemetrics.com/).
2. Go to your servers homepage.
3. In the servers tab under Squad, locate the eight-digit number in the search bar after `/squad`. This is your server ID for BattleMetrics.

![Server ID](https://i.imgur.com/FaRiuWr.png)


### Usage

Use the command prefix defined in the configuration to check for alts and ban information. For example:

    
    !altcheck 76561198000000000
    
THIS COMMAND MUST BE RAN IN THE CHANNEL DEFINED IN THE CONFIG `channelID` IT WILL NOT RUN ANYWHERE ELSE.

### License

This project is licensed under the GNU General Public License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please submit a pull request or open an issue to discuss any changes.

## Acknowledgements

- [SquadJSAltChecker](https://github.com/fantinodavide/squadjs-alt-checker/tree/main)
- [Discord.js](https://discord.js.org/)
- [BattleMetrics](https://www.battlemetrics.com/)
- [Community Ban List](https://communitybanlist.com/)
- [Team Silver Sphere](https://github.com/Team-Silver-Sphere)
