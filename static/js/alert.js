window.addEventListener("DOMContentLoaded", () => {
    const css = document.createElement("link");
    css.setAttribute("rel", "stylesheet");
    css.setAttribute("href", (new URL("assets/alert.css", location.origin)).toString());
    document.body.appendChild(css);
})

window.alert = (text, isSuccessMessage) => {
    const alertBoxContainer = document.createElement("div");
    alertBoxContainer.setAttribute("class", "alertBoxContainer")
    document.body.appendChild(alertBoxContainer);

    const alertTextContainer = document.createElement("div");
    alertTextContainer.setAttribute("class", "alertTextContainer");
    alertBoxContainer.appendChild(alertTextContainer);
    alertTextContainer.innerText = text;

    if (isSuccessMessage) alertTextContainer.style.borderColor = "lime";

    const closeBtn = document.createElement("button");
    closeBtn.setAttribute("class", "input-button alertClose");
    alertBoxContainer.appendChild(closeBtn);
    closeBtn.innerHTML = "Ok";

    window.isShowingAlert = true;

    return new Promise((resolve) => {
        let timeout = setTimeout(() => { closeBtn.onclick() }, 5 * 60e3);
        closeBtn.onclick = () => {
            clearInterval(timeout);
            alertBoxContainer.remove();
            if(document.querySelectorAll(".alertBoxContainer").length === 0){
                window.isShowingAlert = false;
            }
            resolve();
        };
    })
}

let lastEnterPress = 0;
window.addEventListener("keypress", ({ key }) => {
    if(key === "Enter" && window.isShowingAlert){
        const now = Date.now();
        if(now - lastEnterPress > 1e3){
            Array.from(document.querySelectorAll(".alertClose")).pop().click();
            lastEnterPress = now;
        }
    }
})