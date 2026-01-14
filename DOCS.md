# Server Documentation

- [API](#api-methods)
- [WebSocket](#chat-room) (Only for Chat Room)

## API Methods

### Base API path: 
```
/api
````

Following methods exist for interacting with the backend API:

### > Login 
- ```
    POST /api/login
  ```
    Request body: JSON
    ```json
    {
        "username": "......",
        "password": "......"
    }
    ```

- #### Response
    On success, sets cookie "accessToken".<br>
    JSON response:
    ```json
    {
        "error": "boolean",
        "message": "description of error"
    }
    ```

### > Signup 
- ```
    POST /api/signup
  ```
    Request body: JSON
    ```json
    {
        "username": "......",
        "password": "......"
    }
    ```

- #### Response
    On success, sets cookie "accessToken".<br>
    JSON response:
    ```json
    {
        "error": "boolean",
        "message": "description of error"
    }
    ```

### > Logout
- ```
    GET /api/logout
  ```
  > *Requires "accessToken" cookie for auth*

- #### Response
    JSON response:
    ```json
    {
        "error": "boolean",
        "message": "description of error"
    }
    ```

### > Account Details
- ```
    GET /api/account
  ```
  **URLSearchQueryParams**:
  - `username`: `string`

  e.g. `/api/account?username=user1`

  > *Requires "accessToken" cookie for auth*<br>
  > Only the room creator or an admin account can destroy the room.

- #### Response
    JSON response:
    ```json
    {
        "error": "boolean",
        "message": "description of error",
        "username": "......",
        "ip": "......",
        "name": "......",
        "isAdmin": "boolean"
    }
    ```

### > Create Room
- ```
    GET /api/create_room
  ```
  **URLSearchQueryParams**:
  - `username`: `string` (creator username)
  - `password`: `string` (room password, optional)

  e.g. `/api/create_room?username=user1`
  > *Requires "accessToken" cookie for auth*<br>
  > Only the room creator or an admin account can destroy the room.

- #### Response
    JSON response:
    ```json
    {
        "error": "boolean",
        "message": "description of error",
        "id": "Room ID"
    }
    ```

### > Destroy Room
- ```
    GET /api/destroy_room
  ```
  **URLSearchQueryParams**:
  - `username`: `string` (creator username)
  - `rid`: `string` (room id)

  e.g. `/api/destroy_room?username=user1`

  > *Requires "accessToken" cookie for auth*<br>
  > Only the room creator or an admin account can destroy the room.

- #### Response
    JSON response:
    ```json
    {
        "error": "boolean",
        "message": "description of error"
    }
    ```


## Chat Room (Docs WIP)

The chat room is connected through a WebSocket.<br>
 - The WebSocket base path:
    ```
    /api/ws
    ```
Messages sent/recieved are all stringified JSON **array** objects that follow the format:
```js
[
    label: "string", // packet label
    data: {...}    // packet data
]
```

The first array item: `label` is from the [events file](./static/js/configs/events.json).

The server sends a ping message packet every **[CONFIG](./src/config.ts)`.ws_ping_timeout`** miliseconds, which needs to be replied to with with the same packet.

