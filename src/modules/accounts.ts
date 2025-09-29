import { randomUUID } from "crypto";
import { config } from "dotenv";

import { StoreManager } from "./store";
import * as bcrypt from "bcrypt";
import CONFIG from "../config";

// load .env into SECRETS object and not process.env
const SECRETS: Record<string, string> = {};
config({ debug: false, processEnv: SECRETS });
const bcrypt_saltRounds = parseInt(SECRETS.SECRET_ENCRPYTION_KEY);

interface AccountInstance {
    name: string,
    pass: string,
    isAdmin: boolean
}

class AccountManager {
    accounts_file: StoreManager;
    credentials_file: StoreManager;

    constructor() {
        this.accounts_file = new StoreManager(CONFIG.storedFiles.accounts);
        this.credentials_file = new StoreManager(CONFIG.storedFiles.credentials);
    }

    set = async (username: string, password: string) => {
        let encryptedPassword;
        try {
            encryptedPassword = await bcrypt.hash(password, bcrypt_saltRounds);
        } catch (err) {
            console.log(err);
            encryptedPassword = null;
        }
        if (typeof encryptedPassword === "string" && encryptedPassword.length > 0) {
            this.credentials_file.set(username, encryptedPassword);
            this.accounts_file.set(username, {
                name: username,
                isAdmin: false
            });
            return true;
        } 
        return false;
    }

    get = (username: string) => {
        return this.accounts_file.get(username);
    }

    exists = (username: string) => {
        return username in this.accounts_file.stored_data;
    }

    async validatePassword(username: string, validatePass: string) {
        const encodedPass = this.credentials_file.get(username);
        if (
            typeof validatePass === "string" &&
            validatePass.length > 0 &&
            encodedPass
        ) {
            let result = false;
            try {
                result = await bcrypt.compare(validatePass, encodedPass);
            } catch (err) {
                console.log(err);
            }
            return result;
        }
        return false;
    }
}

// Data Store: Temporary account access tokens
class accessTokenRecord {
    accessToken: string;
    createdAt: number;
    constructor() {
        this.accessToken = randomUUID() + "-" + randomUUID();
        this.createdAt = Date.now();
    }
}

class AccessTokensManager {
    store: StoreManager;
    tokenExpiryInterval: number;

    createAccessToken(username: string) {
        const newRecord = new accessTokenRecord();
        this.store.set(username, newRecord);
        return newRecord.accessToken;
    }

    validateAccessToken(username: string, toCheckToken: string): "valid" | "invalid" | "expired" {
        const record: accessTokenRecord = this.store.get(username);
        if (record && (Date.now() - record.createdAt) >= this.tokenExpiryInterval) {
            this.store.remove(username);
            return "expired";
        }
        return record ? (record.accessToken === toCheckToken ? "valid" : "invalid") : "invalid";
    }

    deleteAccessToken(username: string) {
        if(this.store.get(username)) {
            this.store.remove(username);
            return true;
        }
        return false;
    }

    constructor(filepath: string, tokenExpiryInterval: number) {
        this.tokenExpiryInterval = tokenExpiryInterval;
        this.store = new StoreManager(filepath);
    }
}

export { AccessTokensManager, AccountManager, AccountInstance };