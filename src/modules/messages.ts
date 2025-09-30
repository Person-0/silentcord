interface Attachment {
    filename: string, 
    data: Buffer
}

interface parsedMessageAttachments {[filename: string]: string}

class Message {
    content: string;
    attachments: parsedMessageAttachments;
    timestamp: number;
    author: string;
    id: string;

    constructor(author: string, content: string, attachments: parsedMessageAttachments, id: string) {
        this.author = author;
        this.content = content;
        this.attachments = attachments;
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

export { Message, Attachment, parsedMessageAttachments, UpdateInstance}