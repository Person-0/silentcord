const usernameContainer = document.getElementById("username-container");
const ipaddrContainer = document.getElementById("ipaddr-container");
const roomID_input = document.getElementById("roomid-input");
const joinRoomBtn = document.getElementById("join-room-btn");
const createRoomBtn = document.getElementById("create-room-btn");

let account = localStorage.getItem("account");
let returnToLogin = false;

if (account) {
    try {
        account = JSON.parse(atob(account));
    } catch (error) {
        account = undefined;
    }
    if (account.name && account.ip) {
        usernameContainer.innerHTML = account.name;
        ipaddrContainer.innerHTML = account.ip;
        main();
        document.getElementById("landing-page").style.display = "block";
    } else {
        returnToLogin = true;
    }
} else {
    returnToLogin = true;
}

if (returnToLogin) {
    alert("Unauthorized");
    location.href = "./login.html";
}

function main() {
    joinRoomBtn.onclick = () => {
        location.href = "./room.html?rid=" + roomID_input.value;
    }

    createRoomBtn.onclick = async() => {
        const params = new URLSearchParams();
        let roomPass = window.prompt("Enter the password to set for your room (optional)");
        if(roomPass && roomPass.length){
            params.append("password", roomPass);
        } else if(roomPass == null){
            return;
        }
        const response = await fetch(location.origin + "/api/create_room?" + params.toString()).then(res => res.json());
        if(response.error){
            if(response.message){
                alert(response.message);
            } else {
                alert("Unknown error. Please try again later.");
            }
        } else {
            alert("Room Created Successfully. ID: " + response.id);
            location.href = "./room.html?rid=" + response.id;
        }
    }
}