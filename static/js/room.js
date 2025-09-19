const chatContainer = document.getElementById("chat-container");
const chatInput = document.getElementById("chat-input");
const connectedPeopleValue = document.getElementById("online-indicator-value");
const connectedPeopleList = document.getElementById("connected-people-list");

const roomID = (new URLSearchParams(location.search)).get("rid");
const socketURL = (new URL("api/ws", location.origin)).toString();
let account;
let returnToLogin = false;
let includeRIDwhenReturning = false;
if (roomID) {
    let account_raw = localStorage.getItem("act");
    if (account_raw) {
        try {
            account_raw = JSON.parse(atob(account_raw));
        } catch (error) {
            account_raw = undefined;
        }
        if (account_raw && account_raw.username) {
            account = account_raw;
            main().catch((err) => console.log(err));
        } else {
            includeRIDwhenReturning = returnToLogin = true;
        }
    } else {
        includeRIDwhenReturning = returnToLogin = true;
    }
} else {
    alert("Invalid Room ID");
    returnToLogin = true;
}

if (returnToLogin) {
    location.href = "./login.html?" + (includeRIDwhenReturning ? ("rid=" + roomID) : "");
}

async function main() {
    const EVENTS = await (fetch((new URL("js/configs/events.json", location.origin)).toString()).then(res => res.json()));

    const ws = new WebSocket(socketURL);
    ws.isOpen = false;

    const send = (data) => ws.send(JSON.stringify(data));
    window.ws_send = send;

    ws.onopen = () => {
        ws.isOpen = true;
        send({
            label: EVENTS.LOGIN,
            username: account.username
        });
        send({
            label: EVENTS.ROOM,
            rid: roomID
        });
        clearChatList();
    }

    ws.onmessage = (e) => {
        let data = e.data.toString();
        try {
            data = JSON.parse(data);
            if (!data.label) {
                throw "no data label";
            }
        } catch (error) {
            console.log("Message parse error:", error);
            return;
        }

        switch (data.label) {
            case EVENTS.PING:
                send({ label: EVENTS.PING });
                break;

            case EVENTS.MESSAGE_NEW:
                addNewMessage(data.data.author, data.data.timestamp, "./assets/img/hand_drawn_account.png", data.data.content);
                break;
            
            case EVENTS.ERROR_MSG:
                alert(data.message);
                break;
        }
    }

    ws.onclose = () => {
        location.href = "./login.html";
    }

    document.getElementById("destroy-room-btn").onclick = () => {

    }

    document.getElementById("copy-room-btn").onclick = () => {
        
    }

    chatInput.onkeydown = (e) => {
        if(e.key === "Enter"){
            if(chatInput.value.length > 0){
                send({
                    label: EVENTS.MESSAGE_NEW,
                    content: chatInput.value
                });
                chatInput.value = "";
            }
        }
    }
}

function clearChatList() {
    chatContainer.innerHTML = "";
}

function addNewMessage(author, timestring, profileimg, messageContent) {
    chatContainer.insertAdjacentHTML("beforeend", `
    <div class="chat-item">
        <img class="chat-user-pfp" src="${profileimg}">
        <div class="chat-user-msginfo">
            <div class="chat-user-userNtime">${author} · ${timestring}</div>
            <div class="chat-user-msg">
                ${messageContent}
            </div>
        </div>
    </div>
    `);
}

function addNewOnlinePerson(username, profileimg) {
    connectedPeopleList.insertAdjacentHTML("beforeend", `
    <div class="connected-people-item">
        <img class="item-user-pfp" src="${profileimg}">
        <p class="item-user-name">${username}</p>
    </div>
    `);
}