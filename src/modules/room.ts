import { WebSocket } from "ws";
import { MessageList, Message, UpdateInstance } from "./messages";
import { AccountInstance, AccountManager } from "./accounts";
import * as EVENTS from "../../static/js/configs/events.json";

interface WebSocketConnectedClient extends WebSocket {
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

class Room {
    id: string;
    password: boolean | string;
    messages: MessageList;
    lastUpdate: UpdateInstance;
    createdAt: number;
    creator: string;
    connectedClients: Record<string, ConnectedClient>;

    addClient(username: string, ws: WebSocketConnectedClient, ACCOUNTS: AccountManager) {
        const account = ACCOUNTS.get(username);
        if (account) {
            this.connectedClients[username] = new ConnectedClient(ACCOUNTS.get(username), ws);
            // send all connected users to this client
            for (const [username, client] of Object.entries(this.connectedClients)) {
                ws.sendJSON(EVENTS.USER_JOIN, {username});
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

    broadcastUpdate(update: UpdateInstance, skipUsername: string[] | string = [], callbackPerClient: (client: ConnectedClient)=>void = (client: ConnectedClient) => {}) {
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
            if(callbackPerClient) callbackPerClient(client);
        }
    }

    destroy() {
        const closeEvent = new UpdateInstance(EVENTS.ROOM_DESTROY, {});
        this.broadcastUpdate(closeEvent, [], (client: ConnectedClient) => {
            try{ 
                client.ws.close(); 
            } catch{}
        });
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
                new Message("SYSTEM", "No room password, Security & Privacy may be compromised.", "SYSTEM_MSG"),
                this.createdAt
            )
        }

        const onNewMessage = (type: string, data: any) => {
            this.lastUpdate = new UpdateInstance(type, data);
            this.broadcastUpdate(this.lastUpdate);
        }

        this.messages = new MessageList(onNewMessage);

        this.broadcastUpdate(this.lastUpdate);

        console.log("ROOM_CREATE: ", this.id);
    }
}

export { Room, WebSocketConnectedClient }