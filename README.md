# **SilentCord**
<div>
    <img style="height: 50px" src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Typescript_logo_2020.svg/2048px-Typescript_logo_2020.svg.png">
    <img style="height: 50px" src="https://avatars.githubusercontent.com/u/9950313?s=48&v=4">
    <img style="height: 50px" src="https://avatars.githubusercontent.com/u/5658226?s=200&v=4">
    <img style="height: 50px" src="https://www.w3.org/html/logo/downloads/HTML5_Logo_512.png">
    <img style="height: 50px" src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/CSS3_logo_and_wordmark.svg/1452px-CSS3_logo_and_wordmark.svg.png">
</div>
<br>

A [Discord](https://discord.com/) inspired small and simple web-app to chat with people on a local area network with a room-based system.<br>
Built with NodeJS, TypeScript (ExpressJS, WebSockets) & Vanilla HTML / CSS.<br>
Uses [bcrypt](https://www.npmjs.com/package/bcrypt) to securely store user passwords.

## Preview Screnshots

> **Login Page**
![login](./demo_imgs/intialv2/login.png)

> **Landing Page**
![landing](./demo_imgs/intialv2/landing.png)

> **Chat room**
![room](./demo_imgs/intialv2/chatroom.png)


# Demo App
There is a [demo version of the app](https://silentcord.onrender.com/) hosted on [render.com.](https://render.com)<br>
It has signups closed and the following accounts can be used instead: <br>
```
-----------------------
USERNAME  |  PASSWORD |
-----------------------
 admin    |   admin   |
 user1    |   user    |
 user2    |   user    |
 user3    |   user    |
 user4    |   user    |
 user5    |   user    |
-----------------------
```

# Contributing

## TODO
- Ratelimits to prevent DDOS / DOS
- Attachments
- Voice Chat

## Guide
- Feature requests can be made by opening a new issue.
- If you are working on something, make a new issue with proper description and title describing what you are working on (new feature, bug fix etc.).
- If you are looking for stuff to contribute in, check out the Issues Tab and the todo list.
- Ensure your issue isn't a duplicate of an already existing issue.
- If working on something mentioned in the todo list, after creating the issue add your issue's URL as a hyperlink in front of the todo list item and remove the list item in your final PR before closing the issue. e.g.
    - Todo item 1 - [#00](https://example.com)
- Make sure you communiate with the other contributors if working on the same issue to save time and prevent duplicate work.

## Local Development Setup

- Ensure you have Node.js and npm installed.
- Clone this repo, cd into project's root directory.
- Install all dependencies:<br>
    ```bash
    npm i
    ```
- Create the `.env` file at the root of the project
    - Sample .env file:
        ```
        SECRET_ENCRPYTION_KEY = "7"
        IS_DEMO_WEB = "0"
        ```
<br>   

- Start Application server:
    ```bash
    npm start
    ```
    > This command cleans the access tokens & previously build code, runs the typescript build command & hosts the server.

<br>   

- Specific commmands:
    - ```bash
        npm run clean
        ```
        > Clean the access tokens, previously build code in /dist and other temp files if any.

    <br>    

    - ```bash
        npm run build
        ``` 
        > Runs the typescript build command


# Credits
[Click here to view Credits](./static/credits.md)