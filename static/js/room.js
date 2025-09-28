const messageBreakTimer = 5*60e3; // continous messages from same author is broken after this gap (in ms)

const chatContainer = document.getElementById("chat-container");
const chatInput = document.getElementById("chat-input");
const chatAttachBtn = document.getElementById("chat-attach-btn");
const connectedPeopleValue = document.getElementById("online-indicator-value");
const connectedPeopleList = document.getElementById("connected-people-list");

const roomID = (new URLSearchParams(location.search)).get("rid");
const socketURL = (new URL("api/ws", location.origin)).toString();
let roomPassword = false;
if(localStorage.getItem("lastRoomCreated") !== roomID){
    roomPassword = window.prompt("Enter room password if any:") || false;
}

let account;
let returnToLogin = false;
let includeRIDwhenReturning = false;
let lastUserMessage = { author: null, epochTime: 0 };

chatAttachBtn.onclick = function(){
    alert("Attach file feature unimplemented. Coming soon.");
};

window.showTab = function(tabName) {
    if(tabName !== "chat") {
        alert(tabName + " >> Unimplemented. Coming soon.");
    }
};

(async() => {
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
                await main();
            } else {
                includeRIDwhenReturning = true;
                returnToLogin = true;
            }
        } else {
            includeRIDwhenReturning = true;
            returnToLogin = true;
        }
    } else {
        await alert("Invalid Room ID");
        returnToLogin = true;
    }

    if (returnToLogin) {
        location.href = "./login.html?" + (includeRIDwhenReturning ? ("rid=" + roomID) : "");
    }
})();

async function main() {
    const EVENTS = await (fetch((new URL("js/configs/events.json", location.origin)).toString()).then(res => res.json()));

    const ws = new WebSocket(socketURL);
    ws.isOpen = false;

    const send = (label, data = {}) => {
        if(ws.isOpen) {
            ws.send(JSON.stringify([label, data]))
        } else {
            setTimeout(()=>{send(label, data)}, 100);
        }
    };
    //window.ws_send = send;

    ws.onopen = () => {
        ws.isOpen = true;
        send(EVENTS.LOGIN, {
            username: account.username
        });
        send(EVENTS.ROOM, {
            rid: roomID,
            password: roomPassword
        });
        clearChatList();
    }

    ws.onmessage = async(e) => {
        let pkt = e.data.toString();
        try {
            pkt = JSON.parse(pkt);
            if (!(Array.isArray(pkt) && pkt.length > 0)) {
                throw "bad data";
            }
        } catch (error) {
            console.log("Message parse error:", error);
            return;
        }

        const [label, data] = pkt;
        switch (label) {
            case EVENTS.PING:
                send(EVENTS.PING);
                break;

            case EVENTS.ROOM_DESTROY:
                await alert("Room was destroyed.");
                break;

            case EVENTS.MESSAGE_NEW:
                addNewMessage(data.author, data.timestamp, "./assets/img/hand_drawn_account.png", data.content);
                break;

            case EVENTS.USER_JOIN:
                addNewOnlinePerson(data.username, "./assets/img/hand_drawn_account.png");
                break;
            
            case EVENTS.USER_LEAVE:
                removeOnlinePerson(data.username);
                break;

            case EVENTS.__DEV_REJOIN:
                location.href = location.href;
                break;

            case EVENTS.__DEV_CLEARCHAT:
                clearChatList();
                break;

            case EVENTS.SHOW_ALERT:
                await alert(data.message, data.isSuccessMessage);
                break;
            
            case EVENTS.WS_CLOSE:
                console.log("WS CLOSED:", data.message);
                break;
        }
    }

    ws.onclose = () => {
        location.href = "./login.html";
    }

    document.getElementById("destroy-room-btn").onclick = async () => {
        const params = new URLSearchParams();
        params.append("username", account.username);
        params.append("rid", roomID);
        const res = await fetch(location.origin + "/api/destroy_room?" + params.toString()).then(res => res.json());
        if (res.error) {
            await alert("Error: " + res.message);
        }
    }

    document.getElementById("copy-room-btn").onclick = () => {
        navigator.clipboard.writeText(location.href).then(
            async() => alert("Room URL copied to clipboard", true)
        ).catch("Could not copy room id to clipboard. Room id: " + roomID);
    }

    chatInput.onkeydown = (e) => {
        if (e.key === "Enter") {
            if (chatInput.value.length > 0) {
                send(EVENTS.MESSAGE_NEW, {
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

function addNewMessage(author, epochTime, profileimg, messageContent) {
    const newDate = new Date(epochTime);
    const timeString = [newDate.getHours(), newDate.getMinutes()].map(e => {
        const t = e.toString();
        return t.length === 1 ? ("0" + t) : t;
    }).join(":");

    if (
        lastUserMessage.author &&
        lastUserMessage.author === author &&
        (epochTime - lastUserMessage.epochTime) <= messageBreakTimer
    ) {
        const lastMessageContentContainer = Array.from(document.querySelectorAll(".chat-user-msg")).pop();
        lastMessageContentContainer.innerHTML += "<br>";
        lastMessageContentContainer.innerText += messageContent;
    } else {
        chatContainer.insertAdjacentHTML("beforeend", `
            <div class="chat-item">
                <img class="chat-user-pfp" src="${profileimg}">
                <div class="chat-user-msginfo">
                    <div class="chat-user-userNtime">${author} · <p class="time-string-inchat">${timeString}<p></div>
                    <div class="chat-user-msg"></div>
                </div>
            </div>
        `)
        Array.from(document.querySelectorAll(".chat-user-msg")).pop().innerText = messageContent;
        lastUserMessage = { author, epochTime };
    }
}

function addNewOnlinePerson(username, profileimurl) {
    connectedPeopleList.insertAdjacentHTML("beforeend", `
    <div class="connected-people-item">
        <img class="item-user-pfp" src="${profileimurl}">
        <p class="item-user-name"></p>
    </div>
    `);
    const lastItem = Array.from(document.querySelectorAll(".connected-people-item")).pop();
    lastItem.setAttribute("data-connected-user-username", username);
    lastItem.querySelector(".item-user-name").innerText = username;
    connectedPeopleValue.innerHTML = parseInt(connectedPeopleValue.innerHTML) + 1;
}

function removeOnlinePerson(username) {
    try {
        document.querySelector("[data-connected-user-username="+username+"]").remove();
        connectedPeopleValue.innerHTML = parseInt(connectedPeopleValue.innerHTML) - 1;
    } catch (error) {
        console.log("remove_online_person_error:", error);
    }
}