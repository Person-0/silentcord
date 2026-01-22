export default {
    "server_port": 8000,
    "min_room_password_length": 0,
    "max_room_password_length": 10,
    "accepting_new_registrations": true,
    "min_password_length": 4,
    "max_password_length": 30,
    "min_username_length": 3,
    "max_username_length": 16,
    "ws_ping_timeout": 5e3, // 5 seconds
    "access_token_expire_interval": 1e3 * 60 * 60 * 24 * 7, // 7 days
    "storedFiles": {
        "accessTokens": "accesstokens.json",
        "accounts": "accounts.json",
        "credentials": "account_credentials.json"
    },
    // New Rate Limiting Configuration
    "rateLimit": {
        "windowMs": 15 * 60 * 1000, // 15 minutes
        "maxRequests": 100, // Limit each IP to 100 requests per window
        "wsMaxConnections": 50 // Maximum total concurrent WebSocket connections
    }
}