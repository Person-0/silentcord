const usernameContainer = document.getElementById("username-container");
const ipaddrContainer = document.getElementById("ipaddr-container");
const roomID_input = document.getElementById("roomid-input");
const joinRoomBtn = document.getElementById("join-room-btn");
const createRoomBtn = document.getElementById("create-room-btn");

let account;

joinRoomBtn.onclick = () => {
    location.href = "./room.html?rid=" + roomID_input.value;
}

createRoomBtn.onclick = async () => {
    const params = new URLSearchParams();
    params.append("username", account.username);
    let roomPass = window.prompt("Enter the password to set for your room (optional)");
    if (roomPass && roomPass.length > 0) {
        params.append("password", roomPass);
    } else if (roomPass == null) {
        return;
    } else {
        await alert("No Room password, anyone with the Room ID can join.");
    }
    const response = await fetch(location.origin + "/api/create_room?" + params.toString()).then(res => res.json());
    if (response.error) {
        if (response.message) {
            await alert(response.message);
        } else {
            await alert("Unknown error. Please try again later.");
        }
    } else {
        await alert("Room Created Successfully. ID: " + response.id, true);
        localStorage.setItem("lastRoomCreated", response.id);
        location.href = "./room.html?rid=" + response.id;
    }
}

window.show_landing_page = async function show_landing_page(username) {
    const roomID = (new URLSearchParams(location.search)).get("rid");
    
    const params = new URLSearchParams();
    params.append("username", username);
    const res = await fetch(location.origin + "/api/account?" + params.toString()).then(res => res.json()).catch(err => console.log(err));

    if (typeof res === "object" && !res.error) {
        account = res.data;

        // save username & accountdata in localStorage
        window.localStorage.setItem("act", username);
        window.localStorage.setItem("act_data", btoa(JSON.stringify(account)));

        usernameContainer.innerHTML = account.name;
        ipaddrContainer.innerHTML = account.ip;

        window.switchCSS("landingPageCSS");
        document.getElementById("landing-page").style.display = "block";
        document.getElementById("acc-toggle-btn").innerHTML = "Logout";
        document.getElementById("acc-toggle-btn").onclick = logoutAccount;

        if (roomID) {
            location.href = "./room.html?rid=" + roomID;
        }
    } else {
        await alert((res ? (res.message || false) : false) || "Error while fetching account details");
        logoutAccount();
    }
}

async function logoutAccount() {
    await logoutOtherSessions();
    localStorage.clear();
    clearCookies();
    location.reload();
}

async function logoutOtherSessions() {
    try {
        const params = new URLSearchParams();
        params.append("username", localStorage.getItem("act"));
        await fetch(location.origin + "/api/account?" + params.toString());
    } catch (e) { console.log("logout:", e); }
}