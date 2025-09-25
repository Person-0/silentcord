/*
    <link rel="stylesheet" href="file1.css"> >> unaffected
    <link id="file2" class="css_file" rel="stylesheet" href="file2.css"> >> disabled on start
    <link id="file3" class="css_file" rel="stylesheet" href="file3.css"> >> disabled on start

    switchCSS("file2") >> only file1.css & file2.css loaded
    switchCSS("file3") >> only file1.css & file3.css loaded
*/

function disableAllCSSFiles() {
    for (const css_el of document.querySelectorAll(".css_file")) {
        css_el.setAttribute("rel", "disabled_stylesheet");
    }
}

window.switchCSS = function (id) {
    const css_el = document.getElementById(id);
    if (css_el) {
        disableAllCSSFiles();
        css_el.setAttribute("rel", "stylesheet");
    } else {
        console.log("CSS SWITCHER ERROR:", "a css file with the provided id does not exist. id provided:", id);
    }
}

disableAllCSSFiles();