/*
New Revenue Tracking with de-duplication and currency conversion
*/

Object.prototype.extend = function (obj) {
    for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
            this[i] = obj[i];
        }
    }
};

function getCookie(name) {
    var start = document.cookie.indexOf(name + "=");
    var len = start + name.length + 1;
    if ((!start) && (name != document.cookie.substring(0, name.length))) {
        return "";
    }
    if (start == -1) return "";
    var end = document.cookie.indexOf(';', len);
    if (end == -1) end = document.cookie.length;
    return unescape(document.cookie.substring(len, end));
}

function setCookie(name, value, expires, path, domain, secure) {
    var today = new Date();
    today.setTime(today.getTime());
    if (expires) {
        expires = expires * 1000 * 60 * 60 * 24;
    }
    var expires_date = new Date(today.getTime() + (expires));
    document.cookie = name + '=' + escape(value) + ((expires) ? ';expires=' + expires_date.toGMTString() : '') + ((path) ? ';path=' + path : '') + ((domain) ? ';domain=' + domain : '') + ((secure) ? ';secure' : '');
}

function checkCookie(id) {
    var orders = getCookie("orders");
    if (orders.indexOf("," + id) > -1) {
        return true;
    } else {
        setCookie("orders", getCookie("orders") + "," + id, 2000, "/");
        return false;
    }
    return false;
}

// Helper function for CORS AJAX
function createCORSRequest(method, url) {
    var xhr = new XMLHttpRequest();
    if ("withCredentials" in xhr) {
        xhr.open(method, url, true);
    } else if (typeof XDomainRequest != "undefined") {
        xhr = new XDomainRequest();
        xhr.open(method, url);
    } else {
        xhr = null;
    }
    return xhr;
}

optly.defaultCurrency = "USD";

function sendRevenue(revenueInCents, eventName) {
    window.optimizely.push(['trackEvent', eventName, {
        'revenue': revenueInCents
    }]);
}

function setDimensions(dimensions) {
    for (var key in dimensions) {
        window['optimizely'].push(['setDimensionValue', key, dimensions[key]]);
    }
}

function unsetDimensions(dimensions) {
    // can we use a call back on the log event instead?
    setTimeout(function () {
        console.log('unsetting dimensions');
        for (var key in dimensions) {
            window['optimizely'].push(['setDimensionValue', key]);
        }
    }, 3000);
}

/**
using Yahoo Finance API
function convertCurrencyAndSendRevenue(revenueInCents, eventName, currency) {
    var request = createCORSRequest("get", "https://query.yahooapis.com/v1/public/yql?q=select%20rate%2Cname%20from%20csv%20where%20url%3D'http%3A%2F%2Fdownload.finance.yahoo.com%2Fd%2Fquotes%3Fs%3D" + currency + optly.defaultCurrency + "%253DX%26f%3Dl1n'%20and%20columns%3D'rate%2Cname'&format=json");
    if (request) {
        request.onload = function () {
            revenueInCents = (revenueInCents * JSON.parse(request.responseText).query.results.row.rate).toFixed(0);
            sendRevenue(revenueInCents, eventName);

        };
        request.send();
    }
}*/

function convertCurrencyAndSendRevenue(revenueInCents, eventName, currency) {
    var request = createCORSRequest("get", "http://api.fixer.io/latest?base=" + currency);
    var request = createCORSRequest("get", "http://api.fixer.io/latest?callback=?");
    var x = "USD";
    if (request) {
        request.onload = function () {
            rates = JSON.parse(request.responseText).rates;
            for (var to_currency in rates) {
                if (to_currency == optly.defaultCurrency) {
                    console.log("Excahnge rate is " +rates[to_currency]);
                    revenueInCents = (revenueInCents * rates[to_currency]).toFixed(0);
                    sendRevenue(revenueInCents, eventName);
                }
            }
            //revenueInCents = (revenueInCents * JSON.parse(request.responseText).query.results.row.rate).toFixed(0);
            //sendRevenue(revenueInCents, eventName);

        };
        request.send();
    }
}

var trackRevenue = {
    trackRevenue: function (revenueInCents, param) {
        console.log("New revenue " + revenueInCents + " with id " + param);

        if (typeof param == "undefined") {
            param = {};
        }

        var id = param.id;
        var currency = param.currency;
        var eventName = "purchase" + (typeof id == "undefined" ? '' : ' ' + id);

        window.optimizely = window.optimizely || [];

        setDimensions(param.dimensions);

        if (typeof id == "undefined" || !checkCookie(id)) {
            console.log("Send revenue tracking");

            if (typeof currency != "undefined") {
                console.log('Convert currency');
                // we need to convert currency
                convertCurrencyAndSendRevenue(revenueInCents, eventName, currency);
                unsetDimensions(param.dimensions);
            } else {
                sendRevenue(revenueInCents, eventName);
                unsetDimensions(param.dimensions);
            }
        } else {
            // this is a duplicate revenue. Do nothing
        }
    }
};


optimizely.extend(trackRevenue);

/*
alternative API to investigate
http://stackoverflow.com/questions/3139879/how-do-i-get-currency-exchange-rates-via-an-api-such-as-google-finance
http://api.fixer.io/latest?base=EUR

http://stackoverflow.com/questions/10430279/javascript-object-extending

run it with 
optimizely.trackRevenue(123, {'currency':'EUR','dimensions':{'product_type':'electronics','country':'nl'}});
*/