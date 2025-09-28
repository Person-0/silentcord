import { Room } from "./room";
import * as EVENTS from "../../static/js/configs/events.json";
import { randomUUID } from "crypto";

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

    constructor(label: string, data: any, timestamp: number = Date.now()) {
        this.label = label;
        this.timestamp = timestamp;
        Object.assign(this, data);
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
        const messageID = "msg_" + randomUUID();
        const message = new Message(author, content, messageID);

        this.items.push(message);
        this.updateCallback(EVENTS.MESSAGE_NEW, message)

        return messageID;
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

export { MessageDatabaseManager, MessageList, UpdateInstance, Message }