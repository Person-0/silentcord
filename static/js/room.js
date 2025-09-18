const roomID = (new URLSearchParams(location.search)).get("rid");
const socketURL = (new URL("api/ws", location.origin)).toString();
let account;

if (roomID) {
    let account_raw = localStorage.getItem("account");
    let returnToLogin = false;

    if (account_raw) {
        try {
            account_raw = JSON.parse(atob(account_raw));
        } catch (error) {
            account_raw = undefined;
        }
        if (account_raw && account_raw.username) {
            account = account_raw;
            main();
        } else {
            returnToLogin = true;
        }
    } else {
        returnToLogin = true;
    }

    if(returnToLogin){
        location.href = "./login.html";
    }
} else {
    alert("Invalid Room ID");
    location.href = "./landing.html";
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
        })
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
                document.getElementById("msgcontainertemp").insertAdjacentHTML("afterbegin", `<br><p>${data.data.content}</p>`);
                break;
        }
    }
}