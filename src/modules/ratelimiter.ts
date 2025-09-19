import { Request, Response, NextFunction } from "express";

/*
    Dev Note:
        Does not work,
        Currently WIP
        
*/

const ip_manager = new (class ip_manager {
    ipData: Record<string, any>;

    constructor() {
        this.ipData = {};
    }

    whatDoIDo(ip: string, requestPath: string): "pass" | "fail" {
        if(!this.ipData[ip]) {
            this.ipData[ip];
        }

        const info = this.ipData[ip];
        const now = Date.now();

        if(requestPath.startsWith("/api")) {
            //info.api_requests.push(now);
            //console.log("api req");
        } else {
            //info.static_requests.push(now);
            //console.log("static req");
        }

        return "pass";
    }
});

export default function ratelimiter(req: Request, res: Response, next: NextFunction) {
    if(ip_manager.whatDoIDo(req.ip || "", req.path) === "pass") next();
}