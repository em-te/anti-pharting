/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const EMAIL = /[\w\-\_\.]+(?:@|%40)(?:[\w\-\_]+\.)+\w+/g;

//used to generate random email addresses
const alpha = "ibcdifghijklmnipqrstivwxyz".split("").sort((a, b) => (a === b) ? 0 : Math.random() > 0.5 ? 1 : -1).join("");

function $(id) {return document.getElementById(id)}

let url;  //is URL()
let randUrl;

let referer = "";

if(history.state) {
  init(history.state, false);
} else {
  chrome.runtime.sendMessage({getUrl: true}, data => {
    //save the state here because it will be cleared from the background
    //script after we have fetched it. We save it in case the user reloads
    //this page which will try to get it from the background script again.
    history.replaceState(data, document.title, location.href);
    init(data, true);
  });
}

function init(data, firstVisit) {
  if(data) {
    url = data.url;
    referer = data.referer;
  }

  if(url) {
    let emails = url.match(EMAIL);
    let randEmails = emails.map(s => randEmail(s));

    randUrl = url.replace(emails[0], randEmails[0]);

    let emailNode = $("email");
    emailNode.id = "";

    emailNode.textContent = emails[0].replace("%40", "@");

    let duplicate = {};
    duplicate[emails[0]] = true;
    for(let i = 1; i < emails.length; i++) {
      if(!duplicate[emails[i]]) {
        emailNode.parentNode.insertBefore(document.createTextNode(" "), emailNode);
        emailNode.parentNode.insertBefore(emailNode.cloneNode(true), emailNode).textContent = emails[i].replace("%40", "@");

        duplicate[emails[i]] = true;
      }

      randUrl = randUrl.replace(emails[i], randEmails[i]);
    }

    url = new URL(url);

    $("url").textContent = url.href;

    //if the user is visiting this page for the first time then we can 
    //redirect them automatically if needed. But if they clicked "back" 
    //to revisit this page then don't redirect them.
    if(firstVisit && chrome.bookmarks) {
      //if the domain is found in bookmarks then assume it is trusted and
      //redirect the user back to the desired page
      chrome.bookmarks.search(url.origin, list => {
        if(list && list.length > 0) {
          $("actions").style.display = "none";
          leavePage();
        }
      });
    }

    //if the user visited this domain multiple times before then we 
    //show a message letting them know
    if(chrome.history) {  //history not available on Mobile
      chrome.history.search({
        text: url.origin,
        startTime: Date.now()-365*24*60*60000,
        endTime: Date.now()-60000,
        maxResults: 10
      }, list => {
        if(list && list.length > 0) {
          $("visitCount").textContent = chrome.i18n.getMessage(
            (list.length >= 10 ? "visitCountMany" : list.length > 1 ? "visitCountSome" : "visitCountOne"),
            "" + list.length
          );
        } else {
          $("visitCount").textContent = chrome.i18n.getMessage("visitCountNone");
        }
      });
    } else {
      $("visitStats").hidden = true;
    }

    if(/(^|\.)\w{2,3}\.\w{2}$/.test(url.hostname)) {
      //attempt to capture these domains: msn.uk, longdomain.co.uk, longdomain.org.uk
      let match = /([\w\-\_]+\.)?(\w{2,3}\.\w{2})$/.exec(url.hostname);
      let prefix = punycode.toUnicode(match[1] || "");
      $("tld").textContent = (prefix.length > 10 ? "..." + prefix.substr(-10) : prefix) + match[2];
      $("subdomain").textContent = "";     

    } else {
      //separate the domain into 2 parts: "dev1.server1." "alkamai.com"
      let match = /([\w\-\_]+\.)?([\w\-\_]+\.[\w\-\_]+)$/.exec(url.hostname);
      let prefix = punycode.toUnicode(match[1] || "");
      $("subdomain").textContent = prefix.length > 10 ? "..." + prefix.substr(-10) : prefix;
      $("tld").textContent = punycode.toUnicode(match[2]);
    }

    $("replaceBtn").textContent = chrome.i18n.getMessage("replaceBtn", randEmails[0].replace("%40", "@"));

    $("replaceBtn").disabled = false;
    $("goBtn").disabled = false;
  }
}

$("replaceBtn").onclick = e => {  //load "randUrl" into tab
  if(url) leavePage(randUrl);
};

$("goBtn").onclick = e => {  //load "url" into tab
  if(url) leavePage();
};

$("turnOff").onclick = e => {
  chrome.runtime.sendMessage({
    turnOff: {value: !$("turnOff").checked}
  });
};

chrome.bookmarks.onCreated.addListener(onBookmarkChanged);
chrome.bookmarks.onChanged.addListener(onBookmarkChanged);

window.addEventListener("unload", e => {
  chrome.bookmarks.onCreated.removeListener(onBookmarkChanged);
  chrome.bookmarks.onChanged.removeListener(onBookmarkChanged);
}, false);

function onBookmarkChanged(id, bm) {
  if(!document.hidden) {
    if(bm.url === chrome.runtime.getURL("redirect.htm")) {
      chrome.bookmarks.update(id, {
        url: url.origin,
        title: chrome.i18n.getMessage("bookmarkTitle", url.host)
      });
    }
  }
}

function leavePage(alt) {
  if(url) {
    chrome.runtime.sendMessage({bypass: {referer}}, () => {
      location.href = alt || url.href;
    });
  }
}

function randEmail(email) {
  let pos = email.indexOf("@");
  if(pos > 0) {
    return alpha.substr(0, pos) + "@" + alpha.substr(~email.lastIndexOf(".") + pos + 2) + ".com";
  } else {
    pos = email.indexOf("%40");
    return alpha.substr(0, pos) + "%40" + alpha.substr(~email.lastIndexOf(".") + pos + 4) + ".com";
  }
}

document.querySelectorAll("*[data-i18n]").forEach(n => {
  n.textContent = chrome.i18n.getMessage(n.getAttribute("data-i18n"));
});

document.title = chrome.i18n.getMessage("extensionName");
