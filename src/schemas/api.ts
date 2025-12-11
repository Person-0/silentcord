import * as z from "zod";
import config from "../config";
import { accessTokenLength } from "../modules/accounts";
import { roomIDlength } from "../modules/room";

const username = z.string().max(config.max_username_length).min(config.min_username_length);
const accountPassword = z.string().max(config.max_password_length).min(config.min_password_length);
const accessToken = z.string().length(accessTokenLength);
const roomPasword = z.string().min(config.min_room_password_length).max(config.max_room_password_length);

export const signupRequest = z.strictObject({
    username,
    password: accountPassword
});

export const loginRequest = signupRequest;

export const logoutRequest = z.strictObject({
    username,
    accessToken
});

export const accountRequest = logoutRequest;

export const createRoomRequest = z.object({
    username,
    password: roomPasword,
    accessToken
});

export const destroyRoomRequest = z.object({
    accessToken,
    username,
    rid: z.string().length(roomIDlength)
})