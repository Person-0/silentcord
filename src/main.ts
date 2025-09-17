import * as path from "path";
import * as http from "http";
import { WebSocketServer } from "ws";
import * as express from "express";
import * as bodyParser from "body-parser";
import { config } from "dotenv";

import EVENTS from "./events";
import CONFIG from "./config";
import { StoreManager } from "./modules/store";

// ==================================================================
// Init
// ==================================================================

//
//neroflv
//moneyis123
//

// load .env into SECRETS object
const SECRETS: Record<string, string> = {};
config({ debug: false, processEnv: SECRETS });

// Data store
interface AccountManager extends StoreManager {
    set: (key: string, value: {
        name: string,
        pass: string,
        isAdmin: boolean
    }) => void
}
const ACCOUNTS: AccountManager = new StoreManager(path.join(__dirname, "../storage", "accounts.json"));

// small random id generator
const makeId = (length: number = 5) => {
    return new Array(length).fill(0).map(e => {
        const allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRTSTUVWXYZ123456789";
        return allowed[Math.floor(Math.random() * allowed.length)];
    }).join("");
}

// short one-liner func to "express_reply" to express requests with stringified json
const express_reply = (res: any, data: {}) => res.send(JSON.stringify(data));

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
    type: string;
    timestamp: number;
    data: any;

    constructor(type: string, data: any, timestamp: number = Date.now()) {
        this.type = type;
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
        if(!append){
            this.items.length = 0;
        }
        this.items.push(...items);
    }

    add: (content: string) => string = (content: string) => {
        const messageID = makeId(12);
        const message = new Message("", content, messageID);

        this.items.push(message);
        this.updateCallback(EVENTS.MESSAGE_NEW, message)

        return messageID;
    }
}

class Room {
    id: string;
    password: boolean | string;
    messages: MessageList;
    lastUpdate: UpdateInstance;
    createdAt: number;

    constructor(id: string, password: string | boolean) {
        this.id = id;
        this.password = password;
        this.createdAt = Date.now();

        if (password) {
            this.lastUpdate = new UpdateInstance(EVENTS.ROOM_CREATE, null);
        } else {
            this.lastUpdate = new UpdateInstance(
                EVENTS.MESSAGE_NEW, 
                new Message("???", "No room password, Security & Privacy may be compromised.", "???"),
                this.createdAt
            )
        }

        const onUpdate = (type: string, data: any) => {
            this.lastUpdate = new UpdateInstance(type, data);
        }

        this.messages = new MessageList(onUpdate);
    }
}

class MessageDatabaseManager {
    rooms: Record<string, Room> = {};

    createRoom = (password: boolean | string) => {
        const id = makeId(5);
        this.rooms[id] = new Room(id, password);
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
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server, path: "/api/ws" });

    // POST request handling ( i do not trust bodyParser.json() )
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.text())

    // static files
    app.use(express.static(path.join(__dirname, "../static")));

    app.post("/api/signup", (req, res) => {
        let error = false;
        let errorMessage = "Unknown Error. Please contact the developer of this application.";
        let response: {} = {};
        try {
            const message: Record<string, string> = JSON.parse(req.body);
            if (
                message.username &&
                message.password &&
                typeof message.username === typeof message.password &&
                typeof message.username === "string" &&
                message.username.length >= CONFIG.min_username_length &&
                message.username.length <= CONFIG.max_username_length &&
                message.password.length >= CONFIG.min_password_length &&
                message.password.length <= CONFIG.max_password_length
            ) {
                const account: Record<string, string> = ACCOUNTS.get(message.username);
                if(!account){
                    const newAccount = {
                        name: message.username,
                        pass: message.password,
                        isAdmin: false
                    };
                    ACCOUNTS.set(message.username, newAccount);
                    response = newAccount;
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
            express_reply(res, { error, response });
        }
    })

    app.post("/api/login", (req, res) => {
        let error = false;
        let errorMessage = "Unknown Error. Please contact the developer of this application.";
        let response: {} = {};
        try {
            const message: Record<string, string> = JSON.parse(req.body);
            if (
                message.username &&
                message.password &&
                typeof message.username === typeof message.password &&
                typeof message.username === "string" &&
                message.username.length >= CONFIG.min_username_length &&
                message.username.length <= CONFIG.max_username_length &&
                message.password.length >= CONFIG.min_password_length &&
                message.password.length <= CONFIG.max_password_length
            ) {
                const account: Record<string, string> = ACCOUNTS.get(message.username);
                if(account){
                    if(message.password === account.pass) {
                        account.ip = req.ip || "???";
                        response = account;
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
            express_reply(res, { error, response });
        }
    })

    const msgDatabase = new MessageDatabaseManager();

    app.get("/api/create_room", (req, res) => {
        const password = req.query["password"]?.toString() || "";
        const roomID = msgDatabase.createRoom(password.length > CONFIG.min_room_password_length ? password : false);
        express_reply(res, {
            id: roomID,
            error: false
        })
    })

    app.get("/api/destroy_room", (req, res) => {
        const auth = req.query["auth"]?.toString() || "";
        const roomID = req.query["rid"]?.toString() || "";
        if (
            auth && roomID &&
            typeof roomID === typeof auth &&
            typeof auth === "string" &&
            auth === SECRETS.ADMIN_AUTH &&
            roomID.length > 0
        ) {
            const done = msgDatabase.destroyRoom(roomID);
            if (done) {
                express_reply(res, {
                    error: false
                })
            } else {
                express_reply(res, {
                    error: true,
                    message: "Room 404"
                })
            }
        }
    })

    app.get("/api/messages", (req, res) => {
        const roomID = req.query["rid"]?.toString() || "";
        const room = msgDatabase.getRoom(roomID);
        if (room) {
            express_reply(res, {
                error: false,
                data: room.messages
            })
        } else {
            express_reply(res, {
                error: true,
                message: "Room 404"
            })
        }
    })

    app.get("/api/poll_update", (req, res) => {
        const roomID = req.query["rid"]?.toString() || "";
        const room = msgDatabase.getRoom(roomID);
        if (room) {
            express_reply(res, {
                error: false,
                data: room.lastUpdate
            })
        } else {
            express_reply(res, {
                error: true,
                message: "Room 404"
            })
        }
    })

    app.post("/api/post_message", (req, res) => {
        let error = false;
        try {
            const message = JSON.parse(req.body);
            if (
                message.content &&
                message.roomID &&
                typeof message.content === typeof message.roomID &&
                typeof message.content === "string"
            ) {
                const room = msgDatabase.getRoom(message.roomID);
                if (room) {
                    room.messages.add(message.content);
                } else {
                    throw "Room 404";
                }
            } else {
                throw "invalid post data";
            }
        } catch (e) {
            error = true;
            console.log("POST_MESSAGE ERROR:", e);
        }
        if (error) {
            express_reply(res, {
                error,
                message: "Unknown Error. Please contact the developer of this application."
            })
        } else {
            express_reply(res, { error });
        }
    })

    // WebSocket connection handler
    wss.on("connection", (ws) => {
        const send = (data: {}) => { ws.send(JSON.stringify(data)) };

        let forceClosed = false;
        let closeReason = "unknown error";
        let hasPinged = false;
        let pingInterval = setInterval(() => {
            if(hasPinged){
                hasPinged = false;
                send({label: "ping"});
            } else {
                try {
                    closeReason = "did not respond to pings";
                    forceClosed = true;
                    ws.close();
                } catch {};
            }
        }, CONFIG.ws_ping_timeout);

        ws.on("close" , () => {
            try {
                clearInterval(pingInterval);
            } catch{}

            if(forceClosed){

            } else {

            }
        })

        // vars for this client

        ws.on("message", (rawdata, isBinary) => {
            let data: Record<string, any>;
            try {
                data = JSON.parse(rawdata.toString());
                if(!(typeof data.label === "string" && data.label.length > 0)) throw "invalid data format";
            } catch (error) {
                closeReason = "malformed data provided";
                forceClosed = true;
                ws.close();
                return;
            }
            if(!forceClosed){
                switch(data.label) {
                    case "ping":
                        hasPinged = true;
                        break;
                }
            }
        })
    })

    // Start the server
    server.listen(CONFIG.server_port, () => {
        console.log("\n\t Server Up on port 80");
        console.log("\t Access at http://127.0.0.1\n");
    })
}

main();