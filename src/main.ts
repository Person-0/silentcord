import * as path from "path";
import { createServer } from "http";
import { existsSync, mkdirSync } from "fs";
import * as crypto from "crypto";

import { WebSocketServer, WebSocket } from "ws";
import * as express from "express";
import * as bodyParser from "body-parser";
import { config } from "dotenv";

import * as EVENTS from "../static/js/configs/events.json";
import CONFIG from "./config";
import { StoreManager } from "./modules/store";
import ratelimiter from "./modules/ratelimiter";

// ==================================================================
// Init
// ==================================================================

// load .env into SECRETS object
const SECRETS: Record<string, string> = {};
config({ debug: false, processEnv: SECRETS });

// Data store
const storagePath = path.join(__dirname, "../storage");
if (!(existsSync(storagePath))) {
    mkdirSync(storagePath);
}

// Data Store: Accounts
interface AccountInstance {
    name: string,
    pass: string,
    isAdmin: boolean
}
interface AccountManager extends StoreManager {
    set: (key: string, value: AccountInstance) => void
}
const ACCOUNTS: AccountManager = new StoreManager(path.join(storagePath, "accounts.json"));

// Data Store: Temporary account access tokens
class accessTokenRecord {
    accessToken: string;
    createdAt: number;
    constructor() {
        this.accessToken = crypto.randomUUID() + "-" + crypto.randomUUID();
        this.createdAt = Date.now();
    }
}

class AccessTokentManager {
    store: StoreManager;
    tokenExpiryInterval: number;

    createAccessToken(username: string) {
        const newRecord = new accessTokenRecord();
        this.store.set(username, newRecord);
        return newRecord.accessToken;
    }

    validateAccessToken(username: string, toCheckToken: string): "valid" | "invalid" | "expired" {
        const record: accessTokenRecord = this.store.get(username);
        if (record && (Date.now() - record.createdAt) >= this.tokenExpiryInterval) {
            this.store.remove(username);
            return "expired";
        }
        return record ? (record.accessToken === toCheckToken ? "valid" : "invalid") : "invalid";
    }

    constructor(filepath: string, tokenExpiryInterval: number) {
        this.tokenExpiryInterval = tokenExpiryInterval;
        this.store = new StoreManager(filepath);
    }
}

const ACCOUNT_TOKENS = new AccessTokentManager(path.join(storagePath, "accesstokens.json"), CONFIG.access_token_expire_interval);

// simple cookie reader
function readCookies(cookiesStr: string): Record<string, string> {
    let cookies: any = false;
    try {
        cookies = cookiesStr.split(";");
        cookies = cookies.map((e: string) => e.split("="));
        cookies = Object.fromEntries(cookies);
    } catch {
        cookies = false;
    }
    if (typeof cookies === "object") {
        return cookies;
    } else {
        return {};
    }
}

// ==================================================================
// Classes
// ==================================================================

class Message {
    content: string;
    timestamp: number;
    author: string;
    id: string;

    constructor(author: string, content: string, id: string) {
        this.author = author;
        this.content = content;
        this.timestamp = Date.now();
        this.id = id;
    }
}

class UpdateInstance {
    label: string;
    timestamp: number;
    data: any;

    constructor(label: string, data: any, timestamp: number = Date.now()) {
        this.label = label;
        this.data = data;
        this.timestamp = timestamp;
    }
}

class MessageList {
    items: Message[] = [];
    updateCallback: (type: string, data: any) => void;

    constructor(updateCallback: (type: string, data: any) => void) {
        this.updateCallback = updateCallback;
    }

    loadItems: (items: [], append: boolean) => void = (items: [], append: boolean = false) => {
        if (!append) {
            this.items.length = 0;
        }
        this.items.push(...items);
    }

    add: (author: string, content: string) => string = (author: string, content: string) => {
        const messageID = "msg_" + crypto.randomUUID();
        const message = new Message(author, content, messageID);

        this.items.push(message);
        this.updateCallback(EVENTS.MESSAGE_NEW, message)

        return messageID;
    }
}

interface WebSocketConnectedClient extends WebSocket {
    sendJSON: (data: {}) => void
}

class ConnectedClient {
    account: AccountInstance;
    ws: WebSocketConnectedClient;

    constructor(account: AccountInstance, ws: WebSocketConnectedClient) {
        this.account = account;
        this.ws = ws;
    }
}

class Room {
    id: string;
    password: boolean | string;
    messages: MessageList;
    lastUpdate: UpdateInstance;
    createdAt: number;
    creator: string;
    connectedClients: Record<string, ConnectedClient>;

    addClient(username: string, ws: WebSocketConnectedClient) {
        const account = ACCOUNTS.get(username);
        if (account) {
            this.connectedClients[username] = new ConnectedClient(ACCOUNTS.get(username), ws);
        } else {
            console.log(`[ERROR] Room (${this.id}) > tried to add non-authorized client (username: ${username})`);
            try { ws.close() } catch { };
        }
    }

    removeClient(username: string) {
        if (username in this.connectedClients) {
            delete this.connectedClients[username];
        } else {
            console.log(`[WARN] Room (${this.id}) > tried to remove client (username: ${username}) that does not exist.`);
        }
    }

    broadcastUpdate(update: UpdateInstance, skipUsername: string[] | string = []) {
        for (const [username, client] of Object.entries(this.connectedClients)) {
            if (typeof skipUsername === "string") {
                if (skipUsername === username) {
                    continue;
                }
            } else if (typeof skipUsername === "object" && Array.isArray(skipUsername)) {
                if (skipUsername.includes(username)) {
                    continue;
                }
            }

            client.ws.sendJSON(update);
        }
    }

    constructor(id: string, password: string | boolean, creator: string) {
        this.id = id;
        this.password = password;
        this.createdAt = Date.now();
        this.creator = creator;
        this.connectedClients = {};

        if (password) {
            this.lastUpdate = new UpdateInstance(EVENTS.ROOM_CREATE, null);
        } else {
            this.lastUpdate = new UpdateInstance(
                EVENTS.MESSAGE_NEW,
                new Message("???", "No room password, Security & Privacy may be compromised.", "???"),
                this.createdAt
            )
        }

        const onNewMessage = (type: string, data: any) => {
            this.lastUpdate = new UpdateInstance(type, data);
            this.broadcastUpdate(this.lastUpdate);
        }

        this.messages = new MessageList(onNewMessage);

        this.broadcastUpdate(this.lastUpdate);
    }
}

class MessageDatabaseManager {
    rooms: Record<string, Room> = {};

    createRoom = (password: boolean | string, creator: string) => {
        // small random id generator (need short ids of length 5 for room ids)
        const makeId = (length: number = 5) => {
            return new Array(length).fill(0).map(e => {
                const allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRTSTUVWXYZ123456789";
                return allowed[Math.floor(Math.random() * allowed.length)];
            }).join("");
        }
        const id = makeId();
        this.rooms[id] = new Room(id, password, creator);
        return id;
    }

    destroyRoom = (roomID: string) => {
        const room = this.getRoom(roomID);
        if (room) {
            delete this.rooms[roomID]
            return true;
        } else {
            return false;
        }
    }

    getRoom = (id: string) => {
        return this.rooms[id];
    }
}

// ==================================================================
// Main Function
// ==================================================================

function main() {
    const app = express();
    const server = createServer(app);
    const wss = new WebSocketServer({ server, path: "/api/ws" });

    // short one-liner func to "reply" to express requests with stringified json
    const express_reply = (res: any, data: {}) => res.send(JSON.stringify(data));

    // WIP (unimplemented): ratelimiting to prevent DOS / DDOS
    app.use(ratelimiter);

    // POST request handling
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.text())

    // static files
    app.use(express.static(path.join(__dirname, "../static")));

    // login & signup
    /**
     * 
     * @param username `username` of account
     * @param account `AccountInstance` from `ACCOUNTS.get(...)`
     * @param ip `req.ip` from express app request
     * @returns `{username: string, ip: string, accessToken: string, isAdmin: boolean}`
     */
    function getNewLoginInfo(username: string, account: AccountInstance, ip: string = "???"): Record<string, string | boolean> {
        const account_response: Record<string, string | boolean> = { ...account }; // ez object duplicate
        delete account_response.pass; // remove pass string from account info
        account_response.ip = ip;
        account_response.username = username;
        const newAccessToken = ACCOUNT_TOKENS.createAccessToken(username);
        account_response.accessToken = newAccessToken;
        return account_response;
    }

    app.post("/api/signup", (req, res) => {
        let error = false;
        let errorMessage = "Unknown Error. Please contact the developer of this application.";
        let response: Record<any, any> = {};
        try {
            const message: Record<string, string> = JSON.parse(req.body);

            if (!CONFIG.accepting_new_registrations) {
                errorMessage = "Signups are closed. Please try again later.";
                throw req.ip + " >> tried to register with username [" + (typeof message.username === "string" ? message.username : "<invalid username>") + "] but failed.";
            }

            if (
                message.username &&
                message.password &&
                typeof message.password === "string" &&
                typeof message.username === "string" &&
                message.username.length >= CONFIG.min_username_length &&
                message.username.length <= CONFIG.max_username_length &&
                message.password.length >= CONFIG.min_password_length &&
                message.password.length <= CONFIG.max_password_length
            ) {
                const account = ACCOUNTS.get(message.username);
                if (!account) {
                    ACCOUNTS.set(message.username, {
                        name: message.username,
                        pass: message.password,
                        isAdmin: false
                    });
                    response = getNewLoginInfo(message.username, ACCOUNTS.get(message.username), req.ip);
                } else {
                    error = true;
                    errorMessage = "Account already exists.";
                }
            } else {
                error = true;
                errorMessage = "Invalid Credentials Provided."
            }
        } catch (e) {
            error = true;
            console.log("POST_MESSAGE ERROR:", e);
        }
        if (error) {
            express_reply(res, {
                error,
                message: errorMessage
            })
        } else {
            res.cookie(
                "accessToken",
                response.accessToken,
                { maxAge: CONFIG.access_token_expire_interval }
            ).send(JSON.stringify({ error, response }));
        }
    })

    app.post("/api/login", (req, res) => {
        let error = false;
        let errorMessage = "Unknown Error. Please contact the developer of this application.";
        let response: Record<any, any> = {};
        try {
            const message: Record<string, string> = JSON.parse(req.body);
            if (
                message.username &&
                message.password &&
                typeof message.password === "string" &&
                typeof message.username === "string" &&
                message.username.length >= CONFIG.min_username_length &&
                message.username.length <= CONFIG.max_username_length &&
                message.password.length >= CONFIG.min_password_length &&
                message.password.length <= CONFIG.max_password_length
            ) {
                const account = ACCOUNTS.get(message.username);
                if (account) {
                    if (message.password === account.pass) {
                        response = getNewLoginInfo(message.username, account, req.ip);
                    } else {
                        error = true;
                        errorMessage = "Incorrect Password!";
                    }
                } else {
                    error = true;
                    errorMessage = "Account does not exist!";
                }
            } else {
                error = true;
                errorMessage = "Invalid Credentials Provided."
            }
        } catch (e) {
            error = true;
            console.log("POST_MESSAGE ERROR:", e);
        }
        if (error) {
            express_reply(res, {
                error,
                message: errorMessage
            })
        } else {
            res.cookie(
                "accessToken",
                response.accessToken,
                { maxAge: CONFIG.access_token_expire_interval }
            ).send(JSON.stringify({ error, response }));
        }
    })

    const msgDatabase = new MessageDatabaseManager();

    app.get("/api/create_room", (req, res) => {
        const cookies = readCookies(req.headers.cookie || "");
        const creator = req.query["username"]?.toString() || "";
        const password = req.query["password"]?.toString() || "";
        const accessToken = cookies.accessToken || false;
        if (typeof accessToken === "string") {
            const tokenValidity = ACCOUNT_TOKENS.validateAccessToken(creator, accessToken);
            if (tokenValidity === "valid") {
                const roomID = msgDatabase.createRoom(
                    password.length > CONFIG.min_room_password_length ? password : false,
                    creator
                );
                express_reply(res, {
                    id: roomID,
                    error: false
                })
            } else {
                express_reply(res, {
                    error: true,
                    message: "token status: " + tokenValidity
                })
            }
        } else {
            express_reply(res, {
                error: true,
                message: "invalid access token"
            })
        }
    })

    app.get("/api/destroy_room", (req, res) => {
        const cookies = readCookies(req.headers.cookie || "");
        const accessToken = cookies.accessToken || false;
        const username = req.query["username"]?.toString() || "";
        const roomID = req.query["rid"]?.toString() || "";
        let errorMessage = "";
        if (
            roomID &&
            typeof roomID === "string" &&
            roomID.length > 0
        ) {
            if (typeof accessToken === "string") {
                const tokenValidity = ACCOUNT_TOKENS.validateAccessToken(username, accessToken);
                if (tokenValidity === "valid") {
                    const room = msgDatabase.getRoom(roomID);
                    if (room) {
                        if (room.creator === username) {
                            const done = msgDatabase.destroyRoom(roomID);
                            if (!done) {
                                errorMessage = "Room 404";
                            }
                        } else {
                            errorMessage = "unauthorized";
                        }
                    } else {
                        errorMessage = "Room 404";
                    }
                } else {
                    errorMessage = "token status: " + tokenValidity;
                }
            } else {
                errorMessage = "invalid access token";
            }
        } else {
            errorMessage = "invalid params provided";
        }

        if (errorMessage.length > 0) {
            express_reply(res, {
                error: true,
                message: errorMessage
            })
        } else {
            express_reply(res, { error: false });
        }
    })

    // WebSocket connection handler
    wss.on("connection", (ws: WebSocketConnectedClient, req) => {
        // small one liner to send JSON data to the connected client
        const send = (data: {}) => { try { ws.send(JSON.stringify(data)) } catch (e) { console.log("WebSocket send err:", e) } };
        Object.defineProperty(ws, "sendJSON", { value: send, writable: false, configurable: false });

        const cookies = readCookies(req.headers.cookie || "");

        let forceClosed = false;
        let closeReason = "unknown error";
        let hasPinged = true;
        let pingInterval = setInterval(() => {
            if (hasPinged) {
                hasPinged = false;
                send({ label: EVENTS.PING });
            } else {
                try {
                    closeReason = "did not respond to pings";
                    forceClosed = true;
                    ws.close();
                } catch { };
            }
        }, CONFIG.ws_ping_timeout);

        // client info
        let loggedInAccount: AccountInstance;
        let isLoggedIn = false;
        let username: string;
        let inRoom = false;
        let room: Room;

        let loginTimeout = setTimeout(() => {
            if (!isLoggedIn) {
                forceClosed = true;
                closeReason = "client did not login";
                ws.close();
            }
        }, 5e3);

        ws.on("close", () => {
            try {
                clearInterval(pingInterval);
            } catch { }

            if (forceClosed) {
                console.log("WebSocket was forcefully closed with reason: " + closeReason);
            }

            if (inRoom) {
                room.removeClient(username);
                inRoom = false;
            }
        })

        ws.on("message", (rawdata) => {
            let data: Record<string, any>;
            try {
                data = JSON.parse(rawdata.toString());
                if (!(typeof data.label === "string" && data.label.length > 0)) throw "invalid data format";
            } catch (error) {
                closeReason = "malformed data provided";
                forceClosed = true;
                send({
                    label: EVENTS.ERROR_MSG,
                    message: closeReason
                });
                ws.close();
                return;
            }
            if (!forceClosed) {
                switch (data.label) {

                    case EVENTS.PING:
                        hasPinged = true;
                        break;

                    case EVENTS.LOGIN:
                        if (
                            typeof data.username === "string" &&
                            data.username.length >= CONFIG.min_username_length &&
                            data.username.length <= CONFIG.max_username_length &&
                            ACCOUNTS.get(data.username) &&
                            typeof cookies.accessToken === "string" &&
                            cookies.accessToken.length > 0
                        ) {
                            const validity = ACCOUNT_TOKENS.validateAccessToken(data.username, cookies.accessToken);
                            if (validity === "valid") {
                                clearTimeout(loginTimeout);
                                loggedInAccount = ACCOUNTS.get(data.username);
                                username = data.username;
                                isLoggedIn = true;
                                console.log("[LOG] " + username + " > logged in");
                            } else {
                                closeReason = "accessToken status: " + validity;
                                forceClosed = true;
                                send({
                                    label: EVENTS.ERROR_MSG,
                                    message: closeReason
                                });
                                ws.close();
                            }
                        } else {
                            closeReason = "invalid username/accessToken provided";
                            forceClosed = true;
                            send({
                                label: EVENTS.ERROR_MSG,
                                message: closeReason
                            });
                            ws.close();
                        }
                        break;

                    case EVENTS.ROOM:
                        if (
                            typeof data.rid === "string" &&
                            data.rid.length > 0
                        ) {
                            if (isLoggedIn) {
                                if (inRoom) {
                                    room.removeClient(username);
                                    inRoom = false;
                                }
                                const roomInstance = msgDatabase.getRoom(data.rid);
                                if (roomInstance) {
                                    roomInstance.addClient(username, ws);
                                    inRoom = true;
                                    room = roomInstance;
                                } else {
                                    closeReason = "Room 404";
                                    forceClosed = true;
                                    send({
                                        label: EVENTS.ERROR_MSG,
                                        message: closeReason
                                    });
                                    ws.close();
                                }
                            } else {
                                closeReason = "unauthorized";
                                forceClosed = true;
                                send({
                                    label: EVENTS.ERROR_MSG,
                                    message: closeReason
                                });
                                ws.close();
                            }
                        } else {
                            closeReason = "invalid room id provided";
                            forceClosed = true;
                            send({
                                label: EVENTS.ERROR_MSG,
                                message: closeReason
                            });
                            ws.close();
                        }
                        break;

                    case EVENTS.MESSAGE_NEW:
                        if (inRoom) {
                            if (
                                typeof data.content === "string" &&
                                data.content.length > 0
                            ) {
                                room.messages.add(username, data.content);
                            } else {
                                send({
                                    label: EVENTS.ERROR_MSG,
                                    message: "invalid message sent"
                                });
                            }
                        } else {
                            send({
                                label: EVENTS.ERROR_MSG,
                                message: "cannot send message if not in room"
                            });
                        }
                        break;

                }
            }
        })
    })

    // Start the server
    server.listen(CONFIG.server_port, () => {
        console.log("\n\t Server listening on PORT:", CONFIG.server_port);
        console.log(`\t Access at http://127.0.0.1:${CONFIG.server_port}\n`);
    })
}

main();