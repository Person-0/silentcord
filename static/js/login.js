const usernameInput = document.getElementById("username-input");
const passwordInput = document.getElementById("password-input");
const submitBtn = document.getElementById("submit-login-btn");
const signUpBtn = document.getElementById("signup-login-btn");

const config = {
    "min_password_length": 4,
    "max_password_length": 30,
    "min_username_length": 3,
    "max_username_length": 16
};

async function submitLoginDetails(type) {
    if(
        usernameInput.value.length < config.min_username_length ||
        passwordInput.value.length < config.min_password_length ||
        usernameInput.value.length > config.max_username_length ||
        passwordInput.value.length > config.max_password_length
    ){
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

    if (res.error || !res.response) {
        if (res.message) {
            alert(res.message);
        } else {
            alert("Unknown Error, Please try again later.");
        }
    } else {
        if(res.response.pass) delete res.response.pass;
        localStorage.setItem("account", btoa(JSON.stringify(res.response)));
        location.href = "./landing.html";
    }
}

signUpBtn.onclick = () => submitLoginDetails("signup");
submitBtn.onclick = () => submitLoginDetails("login");
const keyDownHandlerLogin = ({key}) => {
    if(key === "Enter") {
        submitLoginDetails("login");
    }
}
window.addEventListener("keydown", keyDownHandlerLogin);