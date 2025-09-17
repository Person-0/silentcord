import * as fs from "fs";
export class StoreManager {
    path: string;
    encountered_error: boolean;
    stored_data: Record<string, any>;

    constructor(path: string) {
        this.path = path;
        this.stored_data = {};
        this.encountered_error = false;
        this.read();
    }

    get(key: string): {} {
        return this.stored_data[key];
    }

    set(key: string, value: {}) {
        this.stored_data[key] = value;
        this.save();
    }

    read() {
        const data = fs.readFileSync(this.path).toString("utf-8");
        try {
            this.stored_data = JSON.parse(data);
        } catch (error) {
            this.encountered_error = true;
            this.stored_data = {};
        }
    }

    save() {
        try {
            fs.writeFileSync(this.path, JSON.stringify(this.stored_data));
        } catch (error) {
            this.encountered_error = true;
        }
    }
}