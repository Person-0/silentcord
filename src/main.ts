// ==================================================================
// External Dependencies
import * as path from "path";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import * as express from "express";
import * as bodyParser from "body-parser";

// ==================================================================
// User-Defined Modules
import "./loggerpatch";
import * as EVENTS from "../static/js/configs/events.json";
import CONFIG from "./config";
import ratelimiter from "./modules/ratelimiter";
import { AccessTokensManager, AccountManager, AccountInstance } from "./modules/accounts";
import { MessageDatabaseManager } from "./modules/messages";
import { WebSocketConnectedClient, Room } from "./modules/room";

// ==================================================================
// Init
// ==================================================================

// Data store: access tokens, accounts
const ACCOUNTS = new AccountManager();
const ACCOUNT_TOKENS = new AccessTokensManager(CONFIG.storedFiles.accessTokens, CONFIG.access_token_expire_interval);
const msgDatabase = new MessageDatabaseManager();

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
    app.post("/api/signup", async (req, res) => {
        let error = false;
        let errorMessage = "Unknown Error. Please contact the developer of this application.";
        let response: string = "";
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
                    const createAccResult = await ACCOUNTS.set(message.username, message.password);
                    if (createAccResult) {
                        response = ACCOUNT_TOKENS.createAccessToken(message.username);
                    } else {
                        error = true;
                        errorMessage = "Unknown error while creating account. Please contact developer.";
                    }
                } else {
                    error = true;
                    errorMessage = "Account already exists";
                }
            } else {
                error = true;
                errorMessage = "Invalid Credentials Provided"
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
                response,
                { maxAge: CONFIG.access_token_expire_interval }
            ).send(JSON.stringify({ error }));
        }
    })

    app.post("/api/login", async (req, res) => {
        let error = false;
        let errorMessage = "Unknown Error. Please contact the developer of this application.";
        let response: string = "";
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
                const accountInstance = ACCOUNTS.get(message.username);
                if (accountInstance) {
                    if (await ACCOUNTS.validatePassword(message.username, message.password)) {
                        response = ACCOUNT_TOKENS.createAccessToken(message.username);
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
                response,
                { maxAge: CONFIG.access_token_expire_interval }
            ).send(JSON.stringify({ error }));
        }
    })

    app.get("/api/logout", (req, res) => {
        const cookies = readCookies(req.headers.cookie || "");
        const username = req.query["username"]?.toString() || "";
        const accessToken = cookies.accessToken || false;
        let errorMessage = "";
        if (
            typeof accessToken === "string" &&
            typeof username === "string" &&
            accessToken.length > 10 &&
            username.length >= CONFIG.min_room_password_length &&
            ACCOUNTS.exists(username)
        ) {
            const tokenValidity = ACCOUNT_TOKENS.validateAccessToken(username, accessToken);
            if (tokenValidity === "valid") {
                errorMessage = ACCOUNT_TOKENS.deleteAccessToken(username) ? "Could not delete access token" : "";
            } else {
                errorMessage = "Token Status: " + tokenValidity;
            }
        } else {
            errorMessage = "Invalid Access Token / Username";
        }

        express_reply(res, {
            error: errorMessage.length > 0,
            message: errorMessage
        })
    })

    app.get("/api/account", (req, res) => {
        const cookies = readCookies(req.headers.cookie || "");
        const username = req.query["username"]?.toString() || "";
        const accessToken = cookies.accessToken || false;
        let errorMessage = "";
        if (
            typeof accessToken === "string" &&
            typeof username === "string" &&
            accessToken.length > 10 &&
            username.length >= CONFIG.min_room_password_length &&
            ACCOUNTS.exists(username)
        ) {
            const tokenValidity = ACCOUNT_TOKENS.validateAccessToken(username, accessToken);
            if (tokenValidity === "valid") {
                express_reply(res, {
                    data: {
                        ...ACCOUNTS.get(username),
                        ip: req.ip,
                        username
                    },
                    error: false
                })
            } else {
                errorMessage = "Token Status: " + tokenValidity;
            }
        } else {
            errorMessage = "Invalid Access Token / Username";
        }

        if (errorMessage.length > 0) {
            express_reply(res, {
                error: true,
                message: errorMessage
            })
        }
    })

    app.get("/api/create_room", (req, res) => {
        const cookies = readCookies(req.headers.cookie || "");
        const creator = req.query["username"]?.toString() || "";
        const password = req.query["password"]?.toString() || "";
        const accessToken = cookies.accessToken || false;
        let errorMessage = "";
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
                errorMessage = "Token Status: " + tokenValidity;
            }
        } else {
            errorMessage = "Invalid Access Token";
        }

        if (errorMessage.length > 0) {
            express_reply(res, {
                error: true,
                message: errorMessage
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
                        if (room.creator === username || ACCOUNTS.get(username)?.isAdmin) {
                            const done = msgDatabase.destroyRoom(roomID);
                            if (!done) {
                                errorMessage = "Room 404";
                            }
                        } else {
                            errorMessage = "Unauthorized";
                        }
                    } else {
                        errorMessage = "Room 404";
                    }
                } else {
                    errorMessage = "Token Status: " + tokenValidity;
                }
            } else {
                errorMessage = "Invalid Access Token";
            }
        } else {
            errorMessage = "Invalid Params Provided";
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
        const send = (label: string, data: {} = {}) => { try { ws.send(JSON.stringify([label, data])) } catch (e) { console.log("WebSocket send err:", e) } };
        const close_ws = (reason: string) => {
            try {
                try {
                    ws.sendJSON(EVENTS.WS_CLOSE, { message: reason });
                } catch (e) { }
                ws.close();
            } catch (e) { }
        };
        Object.defineProperty(ws, "sendJSON", { value: send, writable: false, configurable: false });

        const cookies = readCookies(req.headers.cookie || "");

        let forceClosed = false;
        let closeReason = "unknown error";
        let hasPinged = true;
        let pingInterval = setInterval(() => {
            if (hasPinged) {
                hasPinged = false;
                send(EVENTS.PING);
            } else {
                try {
                    closeReason = "did not respond to pings";
                    forceClosed = true;
                    close_ws(closeReason);
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
                close_ws(closeReason);
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
            let pkt: [string, Record<string, any>];
            try {
                pkt = JSON.parse(rawdata.toString());
                if (!(Array.isArray(pkt) && pkt.length > 0)) throw "invalid data format";
            } catch (error) {
                closeReason = "malformed data provided";
                forceClosed = true;
                send(EVENTS.SHOW_ALERT, {
                    message: closeReason
                });
                close_ws(closeReason);
                return;
            }

            if (forceClosed) return;

            const [label, data] = pkt;

            if (label === EVENTS.PING) {
                hasPinged = true;
            } else {
                if (isLoggedIn) {
                    switch (label) {

                        case EVENTS.ROOM:
                            if (
                                typeof data.rid === "string" &&
                                data.rid.length > 0
                            ) {
                                if (inRoom) {
                                    room.removeClient(username);
                                    inRoom = false;
                                    room = {} as Room;
                                }
                                const roomInstance = msgDatabase.getRoom(data.rid);
                                if (roomInstance) {
                                    const addToRoom = () => {
                                        roomInstance.addClient(username, ws, ACCOUNTS);
                                        send(roomInstance.lastUpdate.label, roomInstance.lastUpdate);
                                        inRoom = true;
                                        room = roomInstance;
                                    }
                                    if (typeof roomInstance.password === "string") {
                                        if (
                                            (
                                                typeof data.password === "string" &&
                                                roomInstance.password === data.password
                                            ) ||
                                            username === roomInstance.creator
                                        ) {
                                            addToRoom();
                                        } else {
                                            closeReason = "Invalid Room Password";
                                            forceClosed = true;
                                        }
                                    } else {
                                        addToRoom();
                                    }
                                } else {
                                    closeReason = "Room 404";
                                    forceClosed = true;
                                }
                            } else {
                                closeReason = "invalid room id provided";
                                forceClosed = true;
                            }
                            break;

                    }

                    if (inRoom) {
                        switch (label) {

                            case EVENTS.MESSAGE_NEW:
                                if (
                                    typeof data.content === "string" &&
                                    data.content.length > 0
                                ) {
                                    room.messages.add(username, data.content);
                                } else {
                                    send(EVENTS.SHOW_ALERT, {
                                        message: "invalid message sent"
                                    });
                                }
                                break;


                        }
                    } else {
                        switch (label) {
                            default:
                                break;
                        }
                    }
                } else {
                    switch (label) {

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
                                    closeReason = "accessToken Status: " + validity;
                                    forceClosed = true;
                                }
                            } else {
                                closeReason = "invalid username/accessToken provided";
                                forceClosed = true;
                            }
                            break;

                    }
                }
            }

            if (forceClosed) {
                send(EVENTS.SHOW_ALERT, {
                    message: closeReason
                });
                close_ws(closeReason);
            }
        })
    })

    // Start the server
    server.listen(CONFIG.server_port, () => {
        console.log("\t Server listening on PORT:", CONFIG.server_port);
        console.log(`\t Access at http://127.0.0.1:${CONFIG.server_port}\n`);
    })
}

main();