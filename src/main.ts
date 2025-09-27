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

    app.post("/api/signup", async(req, res) => {
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
                    const createAccResult = await ACCOUNTS.set(message.username, message.password);
                    if(createAccResult) {
                        response = getNewLoginInfo(message.username, ACCOUNTS.get(message.username), req.ip);
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
                response.accessToken,
                { maxAge: CONFIG.access_token_expire_interval }
            ).send(JSON.stringify({ error, response }));
        }
    })

    app.post("/api/login", async(req, res) => {
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
                const accountInstance = ACCOUNTS.get(message.username);
                if (accountInstance) {
                    if (await ACCOUNTS.validatePassword(message.username, message.password)) {
                        response = getNewLoginInfo(message.username, accountInstance, req.ip);
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
            errorMessage = "Unknown Error, Please contact developer.";
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
                    message: "Token Status: " + tokenValidity
                })
            }
        } else {
            express_reply(res, {
                error: true,
                message: "Invalid Access Token"
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
                        if (room.creator === username && ACCOUNTS.get(username)?.isAdmin) {
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
        const send = (data: {}) => { try { ws.send(JSON.stringify(data)) } catch (e) { console.log("WebSocket send err:", e) } };
        const close_ws = (reason: string) => {
            try {
                try {
                    ws.sendJSON({label: EVENTS.WS_CLOSE, message: reason});
                } catch (e) {}
                close_ws(closeReason);
            } catch (e) {}
        };
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
            let data: Record<string, any>;
            try {
                data = JSON.parse(rawdata.toString());
                if (!(typeof data.label === "string" && data.label.length > 0)) throw "invalid data format";
            } catch (error) {
                closeReason = "malformed data provided";
                forceClosed = true;
                send({
                    label: EVENTS.SHOW_ALERT,
                    message: closeReason
                });
                close_ws(closeReason);
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
                                closeReason = "accessToken Status: " + validity;
                                forceClosed = true;
                                send({
                                    label: EVENTS.SHOW_ALERT,
                                    message: closeReason
                                });
                                close_ws(closeReason);
                            }
                        } else {
                            closeReason = "invalid username/accessToken provided";
                            forceClosed = true;
                            send({
                                label: EVENTS.SHOW_ALERT,
                                message: closeReason
                            });
                            close_ws(closeReason);
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
                                    send(roomInstance.lastUpdate);
                                    inRoom = true;
                                    room = roomInstance;
                                } else {
                                    closeReason = "Room 404";
                                    forceClosed = true;
                                    send({
                                        label: EVENTS.SHOW_ALERT,
                                        message: closeReason
                                    });
                                    close_ws(closeReason);
                                }
                            } else {
                                closeReason = "unauthorized";
                                forceClosed = true;
                                send({
                                    label: EVENTS.SHOW_ALERT,
                                    message: closeReason
                                });
                                close_ws(closeReason);
                            }
                        } else {
                            closeReason = "invalid room id provided";
                            forceClosed = true;
                            send({
                                label: EVENTS.SHOW_ALERT,
                                message: closeReason
                            });
                            close_ws(closeReason);
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
                                    label: EVENTS.SHOW_ALERT,
                                    message: "invalid message sent"
                                });
                            }
                        } else {
                            send({
                                label: EVENTS.SHOW_ALERT,
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
        console.log("\t Server listening on PORT:", CONFIG.server_port);
        console.log(`\t Access at http://127.0.0.1:${CONFIG.server_port}\n`);
    })
}

main();