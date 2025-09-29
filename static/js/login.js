const usernameInput = document.getElementById("username-input");
const passwordInput = document.getElementById("password-input");
const submitBtn = document.getElementById("submit-login-btn");
const signUpBtn = document.getElementById("signup-login-btn");

const config = window.config = {
    "min_password_length": 4,
    "max_password_length": 30,
    "min_username_length": 3,
    "max_username_length": 16
};

window.switchCSS("loginPageCSS");
document.getElementById("acc-toggle-btn").innerHTML = "Login";
document.getElementById("acc-toggle-btn").onclick = function () { location.href = location.origin + "/login.html" };

try {
    // show login page only if accessToken cookie does not exist / expired
    if (document.cookie.includes("accessToken=")) {
        loginSuccess(localStorage.getItem("act") || "");
    } else {
        clearCookies();
        throw "token cookie either expired or this is a new user. showing login page only.";
    }
} catch (e) {
    console.log(e);
}

async function submitLoginDetails(type) {
    if (window.isShowingAlert) return;

    if (
        usernameInput.value.length < config.min_username_length ||
        passwordInput.value.length < config.min_password_length ||
        usernameInput.value.length > config.max_username_length ||
        passwordInput.value.length > config.max_password_length
    ) {
        return;
    }

    const res = await fetch(location.origin + "/api/" + type,
        {
            method: "POST",
            body: JSON.stringify(
                {
                    username: usernameInput.value,
                    password: passwordInput.value
                }
            )
        }
    ).then(res => res.json());

    if (res.error) {
        if (res.message) {
            alert(res.message);
        } else {
            alert("Unknown Error, Please try again later.");
        }
    } else {
        loginSuccess(usernameInput.value);
    }
}

function loginSuccess(username) {
    // remove login screen & enter event listener if no errors arised in previous statements
    document.getElementById("login-container").remove();
    window.removeEventListener("keydown", keyDownHandlerLogin);

    // show landing page from ./js/landingPage.js
    window.show_landing_page(username);
}

signUpBtn.onclick = () => submitLoginDetails("signup");
submitBtn.onclick = () => submitLoginDetails("login");
function keyDownHandlerLogin({ key }) {
    if (key === "Enter") {
        submitLoginDetails("login");
    }
}
window.addEventListener("keydown", keyDownHandlerLogin);