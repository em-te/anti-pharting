"use strict";

const EMAIL = /[\w\-]+(?:@|%40)(?:[\w\-]+\.)+\w+/;

let active = true;

//let whitelist = {};

//used to temporarily store data for the redirection page.
//After the redirection page retrieves this data during its onload
//we clear it immediately
let processing = {};

//used by the redirection page to set a flag before redirecting away
//so that we can skip over it. The HTTP request handler will clear 
//this flag automatically
let bypass = {};

chrome.webRequest.onBeforeSendHeaders.addListener(
  ({method, originUrl, requestHeaders, requestId, tabId, url}) => {

    //only listen to GET requests because most attacks aren't 
    //sophisticated enough to perform POST
    if(method !== "GET") return;

    url = new URL(url);

    let tabStr = "" + tabId;

    //if(whitelist[url.origin]) return;

    //sometimes onBeforeSendHeaders is called twice
    if(processing[tabStr]) return;

    //the bypass flag will be set by the redirection page if the user
    //selects to view the page normally
    if(bypass[tabStr]) {
      let referer = bypass[tabStr].referer;
      bypass[tabStr].referer = null;

      //restore the referer during bypass if exists
      if(referer) {
        let found = false;
        for(let h of requestHeaders) {
          if(h.name.toLowerCase() === "referer") {
            h.value = referer;
            found = true;
            break;
          }
        }
        if(!found) requestHeaders.push({name: "referer", value: referer});
        return {requestHeaders};
      }

    } else if(active) {

      if(originUrl) {
        originUrl = new URL(originUrl);

        //skip if not the first time visiting since 
        //we might have prompted the user before
        if(originUrl.hostname === url.hostname) return;

        let path = originUrl.pathname + (originUrl.search || "");
        let email = EMAIL.exec(path);

        //skip if referer also contains an email since 
        //we would have prompted the user before
        if(email) return;
      }

      let path = url.pathname + (url.search || "");
      let email = EMAIL.exec(path);

      if(email) {
        processing[tabStr] = {url: url.href};

        //save the referer header which we will restore when leaving
        //the redirection page
        for(let h of requestHeaders) {
          if(h.name.toLowerCase() === "referer") {
            processing[tabStr].referer = h.value;
            break;
          }
        }

        //make the redirection happen asynchronously
        Promise.resolve(true).then(() => {
          chrome.tabs.update(tabId, {
            url: chrome.runtime.getURL("redirect.htm")
          });
        });

        return {cancel: true};
      }
    }

  }, {
    urls: ["*://*/*@*", "*://*/*%40*"],  //only listen for URLs with "@" in the URL path
    types: ["main_frame"]  //only listen for URLs that load as a top-level page
  }, ["blocking", "requestHeaders"]
);


chrome.runtime.onMessage.addListener(
  (msg, sender, reply) => {

    if(sender.tab) {
      let tabStr = "" + sender.tab.id;

      if(msg.getUrl) {
        //when the redirection page loads it will call this to get the data for it's tab
        let data = processing[tabStr];
        if(data) delete processing[tabStr];

        reply(data);

      } else if(msg.bypass) {
        //if the redirection page wants to continue loading the intercepted URL
        //it will call this to add a bypass flag before trying to load the page
        msg.bypass.timer = setTimeout(() => { delete bypass[tabStr]; }, 10000);
        bypass[tabStr] = msg.bypass;

        reply(null);

      } else if(msg.turnOff) {
        active = msg.turnOff.value;
      }
    }
  }
);
