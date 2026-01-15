import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

// load .env into SECRETS object and not process.env
const SECRETS: Record<string, string> = {};
config({ debug: false, processEnv: SECRETS });
let isDemoMode = false;
if(SECRETS.IS_DEMO_WEB === "1"){
    console.log(">> DEMO MODE IS ENABLED. Disabling store and redirecting to demo_files");
    isDemoMode = true;
}

export class FileStoreManager {
    path: string;
    stored_files: [];

    constructor(dirpath: string) {
        const storagePath = path.join(__dirname, "../../storage/staticfiles", dirpath);
        this.path = storagePath;
        this.stored_files = [];

        if(isDemoMode) return;

        if (fs.existsSync(storagePath)) {
            fs.rmSync(storagePath, { recursive: true });
        }
        fs.mkdirSync(storagePath, { recursive: true });
    }

    save(filename: string, filedata: Buffer) {
        if(isDemoMode) return;
        try {
            fs.writeFileSync(path.join(this.path, filename), filedata);
        } catch (error) {
            console.log("STORE >> FILE SAVE() ERROR:", error);
        }
    }

    exists(filename: string) {
        if(isDemoMode) return;
        return fs.existsSync(path.join(this.path, filename));
    }

    delete(filename: string) {
        if(isDemoMode) return;
        try {
            fs.rmSync(path.join(this.path, filename));
        } catch (error) {
            console.log("STORE >> FILE DELETE() ERROR:", error);
        }
    }

    clear() {
        if(isDemoMode) return;
        try {
            fs.rmSync(this.path, { recursive: true, force: true });
        } catch (error) {
            console.log("STORE >> CLEAR() ERROR:", error);
        }
    }
}

export class JSONStoreManager {
    path: string;
    stored_data: Record<string, any>;

    constructor(filename: string) {
        const storagePath = path.join(__dirname, "../../" + (isDemoMode ? "demo_files" : "storage"));
        if (!(fs.existsSync(storagePath))) {
            fs.mkdirSync(storagePath, { recursive: true });
        }

        this.path = path.join(storagePath, filename);
        this.stored_data = {};

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
            this.stored_data = {};
            console.log("STORE >> JSON READ() ERROR:", error);
        }
    }

    save() {
        try {
            fs.writeFileSync(this.path, JSON.stringify(this.stored_data));
        } catch (error) {
            console.log("STORE >> JSON SAVE() ERROR:", error);
        }
    }
}