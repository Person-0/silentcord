export default {
    "server_port": 80,
    "min_room_password_length": 5,
    "accepting_new_registrations": false,
    "min_password_length": 4,
    "max_password_length": 30,
    "min_username_length": 3,
    "max_username_length": 16,
    "ws_ping_timeout": 5e3, // 5 seconds
    "access_token_expire_interval": 1e3 * 60 * 60 * 24 * 7, // 7 days
    "storedFiles": {
        "accessTokens": "accesstokens.json",
        "accounts": "accounts.json"
    }
}