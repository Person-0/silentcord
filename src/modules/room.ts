import { WebSocket } from "ws";
import { randomUUID } from "crypto";

import { Message, Attachment, UpdateInstance, parsedMessageAttachments } from "./messages";
import { AccountInstance, AccountManager } from "./accounts";
import { FileStoreManager } from "./store";
import * as EVENTS from "../../static/js/configs/events.json";

export interface WebSocketConnectedClient extends WebSocket {
    sendJSON: (label: string, data: {}) => void
}

class ConnectedClient {
    account: AccountInstance;
    ws: WebSocketConnectedClient;

    constructor(account: AccountInstance, ws: WebSocketConnectedClient) {
        this.account = account;
        this.ws = ws;
    }
}

export class AttachmentsManager {
    filestore: FileStoreManager;
    rid: string;

    clean() {
        this.filestore.clear();
    }

    add(filename: string, filedata: Buffer) {
        let filename_new = filename;
        let tryIndex = 0;
        while(this.filestore.exists(filename_new)){
            tryIndex += 1;
            filename_new = filename + "_" + tryIndex.toString();
        }
        this.filestore.save(filename_new, filedata);
        // FIX: Use this.rid instead of hardcoded "id"
        return "/attachments/" + this.rid + "/" + filename_new;
    }

    delete(filename: string) {
        this.filestore.delete(filename);
    }

    constructor(rid: string) {
        this.rid = rid;
        this.filestore = new FileStoreManager(rid);
    }
}

export class Room {
    id: string;
    password: boolean | string;
    lastUpdate: UpdateInstance;
    createdAt: number;
    creator: string;
    attachments: AttachmentsManager;
    connectedClients: Record<string, ConnectedClient>;

    addClient(username: string, ws: WebSocketConnectedClient, ACCOUNTS: AccountManager) {
        const account = ACCOUNTS.get(username);
        if (account) {
            this.connectedClients[username] = new ConnectedClient(ACCOUNTS.get(username), ws);
            // send all connected users to this client
            for (const [username, client] of Object.entries(this.connectedClients)) {
                ws.sendJSON(EVENTS.USER_JOIN, { username });
            }
            // tell all other clients that this user joined
            this.broadcastUpdate(new UpdateInstance(EVENTS.USER_JOIN, { username }), username);
        } else {
            console.log(`[ERROR] Room (${this.id}) > tried to add non-authorized client (username: ${username})`);
            try { ws.close() } catch { };
        }
    }

    removeClient(username: string) {
        if (username in this.connectedClients) {
            delete this.connectedClients[username];
            this.broadcastUpdate(new UpdateInstance(EVENTS.USER_LEAVE, { username }));
        } else {
            console.log(`[WARN] Room (${this.id}) > tried to remove client (username: ${username}) that does not exist.`);
        }
    }

    sendDirect(targetUsername: string, label: string, data: {}) {
        if (targetUsername in this.connectedClients) {
            this.connectedClients[targetUsername].ws.sendJSON(label, data);
        }
    }

    broadcastUpdate(update: UpdateInstance, skipUsername: string[] | string = [], callbackPerClient: (client: ConnectedClient) => void = (client: ConnectedClient) => { }) {
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

            const { label, ...packet } = update;
            client.ws.sendJSON(label, packet);
            if (callbackPerClient) callbackPerClient(client);
        }
    }

    destroy() {
        this.attachments.clean();

        const closeEvent = new UpdateInstance(EVENTS.ROOM_DESTROY, {});
        this.broadcastUpdate(closeEvent, [], (client: ConnectedClient) => {
            try {
                client.ws.close();
            } catch { }
        });
    }

    constructor(id: string, password: string | boolean, creator: string, attachments: AttachmentsManager) {
        this.id = id;
        this.password = password;
        this.createdAt = Date.now();
        this.creator = creator;
        this.connectedClients = {};
        this.attachments = attachments;

        if (password) {
            this.lastUpdate = new UpdateInstance(EVENTS.ROOM_CREATE, null);
        } else {
            this.lastUpdate = new UpdateInstance(
                EVENTS.MESSAGE_NEW,
                new Message("SYSTEM", "No room password, Security & Privacy may be compromised.", {}, "SYSTEM_MSG"),
                this.createdAt
            )
        }

        this.broadcastUpdate(this.lastUpdate);

        console.log("ROOM_CREATE: ", this.id);
    }

    addMessage(author: string, content: string = "", msg_attachments: Attachment[] = []) {
        const messageID = "msg_" + randomUUID();
        const attachmentFilePaths: parsedMessageAttachments = {};
        if(msg_attachments.length > 0){
            for(const attachment of msg_attachments) {
                attachmentFilePaths[attachment.filename] = this.attachments.add(attachment.filename, attachment.data);
            }
        }
        const message = new Message(author, content, attachmentFilePaths, messageID);
        this.lastUpdate = new UpdateInstance(EVENTS.MESSAGE_NEW, message);
        this.broadcastUpdate(this.lastUpdate);
    }
}

export const roomIDlength = 5;
export class RoomsManager {
    rooms: Record<string, Room> = {};

    createRoom = (password: boolean | string, creator: string, hostStatic: (endpoint: string, dirpath: string) => void) => {
        // small random id generator (need short ids for room ids)
        const makeId = (length: number) => {
            return new Array(length).fill(0).map(e => {
                const allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRTSTUVWXYZ123456789";
                return allowed[Math.floor(Math.random() * allowed.length)];
            }).join("");
        }
        const id = makeId(roomIDlength);
        const attachments = new AttachmentsManager(id);
        hostStatic("/attachments/" + id, attachments.filestore.path);
        this.rooms[id] = new Room(id, password, creator, attachments);
        return id;
    }

    destroyRoom = (roomID: string) => {
        const room = this.getRoom(roomID);
        if (room) {
            room.destroy();
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