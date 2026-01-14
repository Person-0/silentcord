const messageBreakTimer = 5 * 60e3; // continous messages from same author is broken after this gap (in ms)

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
let roomPassword = false;
let lastUserMessage = { author: null, epochTime: 0 };

(async () => {
    if (roomID) {
        let account_raw = localStorage.getItem("act_data");
        if (account_raw) {
            try {
                account_raw = JSON.parse(atob(account_raw));
            } catch (error) {
                account_raw = undefined;
            }
            if (account_raw && account_raw.username) {
                account = account_raw;
                if (localStorage.getItem("lastRoomCreated") !== roomID) {
                    roomPassword = window.prompt("Enter room password if any:") || false;
                }
                await main();
            } else {
                console.log("returning to login, account data not valid json / username does not exist in account data");
                includeRIDwhenReturning = true;
                returnToLogin = true;
            }
        } else {
            console.log("returning to login, account data does not exist");
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
    const EVENTS = await fetchConfig("events.json");
    const MSGCONFIG = await fetchConfig("messageConfig.json");

    const ws = new WebSocket(socketURL);
    ws.isOpen = false;

    const send = (label, data = {}) => {
        if (ws.isOpen) {
            ws.send(JSON.stringify([label, data]))
        } else {
            setTimeout(() => { send(label, data) }, 100);
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

    ws.onmessage = async (e) => {
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
                console.log(data);
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
            case EVENTS.VOICE_JOIN:
                if (localStream && data.username !== account.username) {
                    console.log("User joined voice:", data.username);
                    connectToNewPeer(data.username);
                }
                break;

            case EVENTS.VOICE_LEAVE:
                console.log("User left voice:", data.username);
                removePeer(data.username);
                break;

            case EVENTS.VOICE_SIGNAL:
                handleVoiceSignal(data);
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
            async () => alert("Room URL copied to clipboard", true)
        ).catch("Could not copy room id to clipboard. Room id: " + roomID);
    }

    let isChatInputFocused = false;
    chatInput.onfocus = () => { isChatInputFocused = true };
    chatInput.onblur = () => { isChatInputFocused = false };

    chatInput.onkeydown = (e) => {
        if (e.key === "Enter") {
            if (chatInput.value.length > 0) {
                send(EVENTS.MESSAGE_NEW, {
                    content: chatInput.value
                });
                chatInput.value = "";
                chatInput.blur();
            }
        }
    }

    window.addEventListener("keypress", (e) => {
        const key = e.key.toLowerCase();
        if (
            !window.isShowingAlert &&
            !isChatInputFocused &&
            !e.ctrlKey &&
            "abcdefghijklmnopqrstuvwxyz0123456789".includes(key)
        ) {
            chatInput.focus();
        }
    })

    chatAttachBtn.onclick = function () {
        alert("Attach file feature unimplemented. Coming soon.");
    };
    
    //voice chat

    const joinVoiceBtn = document.getElementById("join-voice-btn");
    const leaveVoiceBtn = document.getElementById("leave-voice-btn");
    const muteBtn = document.getElementById("mute-btn");
    const muteIcon = document.getElementById("mute-icon");
    const activeControls = document.getElementById("active-controls");
    
    const voiceStatus = document.getElementById("voice-status");
    const voicePeersList = document.getElementById("voice-peers-list");
    
    let localStream = null;
    let isMuted = false;
    const voicePeers = {}; 
    const voicePeerElements = {};

    const rtcConfig = { iceServers: [] };


    function removePeer(username) {
        if (voicePeers[username]) {
            voicePeers[username].close();
            delete voicePeers[username];
        }
        if (voicePeerElements[username]) {
            voicePeerElements[username].remove();
            delete voicePeerElements[username];
        }
    }

    function createPeerConnection(targetUsername) {
        if (voicePeers[targetUsername]) {
            return voicePeers[targetUsername];
        }

        const pc = new RTCPeerConnection(rtcConfig);

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        pc.ontrack = (event) => {
            if (!voicePeerElements[targetUsername]) {
                const audioEl = document.createElement("audio");
                audioEl.autoplay = true;
                audioEl.srcObject = event.streams[0];
                
                const card = document.createElement("div");
                card.className = "peer-card";
                card.innerHTML = `
                    <img src="./assets/img/hand_drawn_account.png" class="peer-avatar" alt="User">
                    <div class="peer-name">${targetUsername}</div>
                `;
                card.appendChild(audioEl);

                voicePeersList.appendChild(card);
                voicePeerElements[targetUsername] = card;
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                send(EVENTS.VOICE_SIGNAL, {
                    target: targetUsername,
                    signal: { type: "candidate", candidate: event.candidate }
                });
            }
        };

        voicePeers[targetUsername] = pc;
        return pc;
    }

    // Expose helpers globally for WS handler
    window.connectToNewPeer = async (targetUsername) => {
        const pc = createPeerConnection(targetUsername);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        send(EVENTS.VOICE_SIGNAL, {
            target: targetUsername,
            signal: { type: "offer", sdp: offer }
        });
    };

    window.handleVoiceSignal = async (data) => {
        const { sender, signal } = data;
        if (!localStream) return;

        let pc = voicePeers[sender];
        if (!pc) pc = createPeerConnection(sender);

        if (signal.type === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            send(EVENTS.VOICE_SIGNAL, {
                target: sender,
                signal: { type: "answer", sdp: answer }
            });

        } else if (signal.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        } else if (signal.type === "candidate") {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (e) { console.error("Error adding candidate", e); }
        }
    };
    
    window.removePeer = removePeer;

    // --- Button Handlers ---

    joinVoiceBtn.onclick = async () => {
        try {
            console.log("Requesting microphone...");
            localStream = await navigator.mediaDevices.getUserMedia(
                { 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }, 
                    video: false 
            });
            console.log("Microphone access granted.");
            
            joinVoiceBtn.style.display = "none";
            activeControls.style.display = "flex";
            
            voiceStatus.innerText = "Status: Connected";
            voiceStatus.className = "status-connected";
            
            if (!voicePeerElements["Me"]) {
                const myCard = document.createElement("div");
                myCard.className = "peer-card";
                myCard.style.border = "1px solid #2da44e";
                myCard.innerHTML = `
                    <img src="./assets/img/hand_drawn_account.png" class="peer-avatar" alt="Me">
                    <div class="peer-name">${account.username} (You)</div>
                `;
                voicePeersList.appendChild(myCard);
                voicePeerElements["Me"] = myCard;
            }

            send(EVENTS.VOICE_JOIN, { username: account.username });

        } catch (err) {
            console.error("Voice Error:", err);
            alert("Could not access microphone. See console for details.");
        }
    };

    muteBtn.onclick = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                // Toggle enabled state
                audioTrack.enabled = !audioTrack.enabled;
                isMuted = !audioTrack.enabled;
                
                if (isMuted) {
                    muteBtn.classList.add("btn-muted");
                    muteIcon.innerText = "mic_off";
                } else {
                    muteBtn.classList.remove("btn-muted");
                    muteIcon.innerText = "mic";
                }
            }
        }
    };

    leaveVoiceBtn.onclick = () => {
        console.log("Leaving voice...");
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        Object.keys(voicePeers).forEach(username => removePeer(username));
        
        if (voicePeerElements["Me"]) {
            voicePeerElements["Me"].remove();
            delete voicePeerElements["Me"];
        }

        send(EVENTS.VOICE_LEAVE, { username: account.username });

        joinVoiceBtn.style.display = "flex";
        activeControls.style.display = "none";
        
        isMuted = false;
        muteBtn.classList.remove("btn-muted");
        muteIcon.innerText = "mic";

        voiceStatus.innerText = "Status: Disconnected";
        voiceStatus.className = "status-disconnected";
    };
}

window.selectLeftbarBtn = (btn) => {
    for(const item of Array.from(document.querySelectorAll(".leftbar-btn-selected"))){
        item.classList.remove("leftbar-btn-selected");
    }
    btn.classList.add("leftbar-btn-selected");
}

window.showTab = function (tabName, successCallback) {
    let reqTab;
    const tabs = Array.from(document.querySelectorAll(".tabs"));
    for (const tab of tabs) {
        if (tab && tab.getAttribute("tab-id") == tabName) {
            reqTab = tab;
            break;
        }
    }
    if (reqTab) {
        tabs.map(e => e.style.display = "none");
        reqTab.style.display = "flex";
        successCallback();
    } else {
        alert("Tab id (" + tabName + ") >> Unimplemented.");
    }
};

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
        document.querySelector("[data-connected-user-username=" + username + "]").remove();
        connectedPeopleValue.innerHTML = parseInt(connectedPeopleValue.innerHTML) - 1;
    } catch (error) {
        console.log("remove_online_person_error:", error);
    }
}

function fetchConfig(filename) {
    return (fetch(
        (new URL("js/configs/" + filename, location.origin)
    ).toString()).then(res => res.json()));
}

