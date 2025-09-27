import * as fs from "fs";
import * as path from "path";

export class StoreManager {
    path: string;
    encountered_error: boolean;
    stored_data: Record<string, any>;

    constructor(filename: string) {
        const storagePath = path.join(__dirname, "../../storage");
        if (!(fs.existsSync(storagePath))) {
            fs.mkdirSync(storagePath, { recursive: true });
        }

        this.path = path.join(storagePath, filename);
        this.stored_data = {};
        this.encountered_error = false;

        if(!(fs.existsSync(this.path))){
            this.save();
        }
        
        this.read();
    }

    get(key: string): any {
        return this.stored_data[key];
    }

    set(key: string, value: {} | string) {
        this.stored_data[key] = value;
        this.save();
    }

    remove(key: string) {
        if(key in this.stored_data) {
            delete this.stored_data[key];
            this.save();
        };
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