const chatContainer = document.getElementById("chat-container");
const chatInput = document.getElementById("chat-input");
const chatAttachBtn = document.getElementById("chat-attach-btn");
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

chatAttachBtn.onclick = function(){
    alert("Attach file feature unimplemented. Coming soon.");
}

window.showTab = function(tabName) {
    if(tabName !== "chat") {
        alert(tabName + " >> Unimplemented. Coming soon.");
    }
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

            case EVENTS.ROOM_DESTROY:
                alert("Room was destroyed.");
                break;

            case EVENTS.MESSAGE_NEW:
                addNewMessage(data.data.author, data.data.timestamp, "./assets/img/hand_drawn_account.png", data.data.content);
                break;

            case EVENTS.USER_JOIN:
                addNewOnlinePerson(data.data.username, "./assets/img/hand_drawn_account.png");
                break;
            
            case EVENTS.USER_LEAVE:
                removeOnlinePerson(data.data.username);
                break;

            case EVENTS.__DEV_REJOIN:
                location.href = location.href;
                break;

            case EVENTS.SHOW_ALERT:
                alert(data.message);
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
            alert("Error: " + res.message);
        }
    }

    document.getElementById("copy-room-btn").onclick = () => {
        navigator.clipboard.writeText(location.href).then(
            () => alert("Room URL copied to clipboard")
        ).catch("Could not copy room id to clipboard. Room id: " + roomID);
    }

    chatInput.onkeydown = (e) => {
        if (e.key === "Enter") {
            if (chatInput.value.length > 0) {
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

let lastUserMessage = {};
function addNewMessage(author, epochTime, profileimg, messageContent) {
    const newDate = new Date(epochTime);
    const timeString = newDate.getHours() + ":" + newDate.getMinutes();

    if (lastUserMessage && lastUserMessage.author && lastUserMessage.author === author && (epochTime - lastUserMessage.epochTime) <= 5*60e3) {
        const lastMessageContentContainer = Array.from(document.querySelectorAll(".chat-user-msg")).pop();
        lastMessageContentContainer.innerHTML += "<br>" + messageContent;
    } else {
        chatContainer.insertAdjacentHTML("beforeend", `
            <div class="chat-item">
                <img class="chat-user-pfp" src="${profileimg}">
                <div class="chat-user-msginfo">
                    <div class="chat-user-userNtime">${author} · <p class="time-string-inchat">${timeString}<p></div>
                    <div class="chat-user-msg">
                        ${messageContent}
                    </div>
                </div>
            </div>
        `)
        lastUserMessage = { author, epochTime };
    }
}

function addNewOnlinePerson(username, profileimg) {
    connectedPeopleList.insertAdjacentHTML("beforeend", `
    <div class="connected-people-item" data-connected-user-username="${username}">
        <img class="item-user-pfp" src="${profileimg}">
        <p class="item-user-name">${username}</p>
    </div>
    `);
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