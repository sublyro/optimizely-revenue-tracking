(function () {
    'use strict';
    
    var optly_debug = true;
    var optly_defaultCurrency = "USD";
    var optly_eventName = "purchase";

    /*
     * add transaction id to local storage
     */
    function saveTransaction(id) {
        if (typeof id == "string") {
            localStorage.optly_transactions = (typeof localStorage.optly_transactions == 'undefined' ? "/" + id + "/" : localStorage.optly_transactions + id + "/");
        }    
    }
    /*
     * check if the transaction has already been fired
     * return true if it exists
     */
    function checkTransaction(id) {
        if ((typeof localStorage.optly_transactions == 'undefined') || (localStorage.optly_transactions.indexOf("/" + id + "/") == -1)) {
            return false;
        }
        return true;
    }
 
    /*
     * save the conversion to session storage
     */
    function setConversionRate(from_currency, to_currency, rate) {
        var key = from_currency + "_" + to_currency;
        log_debug("Setting conversion rate for " + key + " to " + rate);
        if (isANumber(rate)) {
            sessionStorage.setItem(key, rate);
        }
    }
    /*
     * check the conversion rate from session storage
     */
    function checkConversionRate(from_currency, to_currency) {    
        var key = from_currency + "_" + to_currency;
        return sessionStorage.getItem(key);
    }

    function isANumber( n ) {
        var numStr = /^-?\d+\.?\d*$/;
        return numStr.test( n.toString() );
    }


    /**
     * Send revenue to Optimizely
     */
    function sendRevenue(revenueInCents, eventName) {
        if (isANumber(revenueInCents)) {
            console.log("ok trackrevenue");
            window.optimizely.push(['trackEvent', eventName, {
                'revenue': revenueInCents
            }]);
        } else {
            log_error("Invalid Revenue " + revenueInCents);
        }
    }

    function setDimensions(dimensions) {
        for (var key in dimensions) {
            window['optimizely'].push(['setDimensionValue', key, dimensions[key]]);
        }
    }

    function unsetDimensions(dimensions) {
        // can we use a call back on the log event instead?
        setTimeout(function () {
            for (var key in dimensions) {
                window['optimizely'].push(['setDimensionValue', key]);
            }
        }, 3000);
    }

    /**
     * Make CORS requests
     */
    function xdr(url, method, param, callback, errback) {
        var req;

        log_debug("CORS request " + url);

        if (XMLHttpRequest) {
            req = new XMLHttpRequest();

            if ('withCredentials' in req) {
                req.open(method, url, true);
                req.onerror = errback;
                req.onreadystatechange = function () {
                    if (req.readyState === 4) {
                        if (req.status >= 200 && req.status < 400) {
                            callback(param, req.responseText);
                        } else {
                            errback(param, new Error('Response returned with non-OK status'));
                        }
                    }
                };
                req.send(null);
            }
        } else if (XDomainRequest) {
            req = new XDomainRequest();
            req.open(method, url);
            req.onerror = errback;
            req.onload = function () {
                callback(param, req.responseText);
            };
            req.send(null);
        } else {
            errback(param, new Error('CORS not supported'));
        }
    }

    /**
     * process the result of the currency conversion depending on the vendor
     */
    function currencyConvertorSuccess(param, result) {
        if (param.vendor == "fixerio") {
            var rates = JSON.parse(result).rates;
            for (var to_currency in rates) {
                if (to_currency == optly_defaultCurrency) {
                    log_debug("[Fixerio] Exchange rate is " + rates[to_currency]);
                    setConversionRate(param.currency, optly_defaultCurrency, rates[to_currency]);
                    var revenueInCents = (param.revenueInCents * rates[to_currency]).toFixed(0);
                    sendRevenue(revenueInCents, param.eventName);
                }
            }
        } else if (param.vendor == "yahoo") {
            log_debug("[Yahoo] Exchange rate is " + JSON.parse(result).query.results.row.rate);
            setConversionRate(param.currency, optly_defaultCurrency, JSON.parse(result).query.results.row.rate);
            var revenueInCents = (param.revenueInCents * JSON.parse(result).query.results.row.rate).toFixed(0);
            sendRevenue(revenueInCents, param.eventName);
        } else {
            log_error("Unknow vendor on success");
        }
    }

    /**
     * vendor specific callback when currencyConversions fails
     */
    function currencyConvertorError(param, msg) {
        if (typeof param.vendor == 'undefined') {
            return;
        }
        if (param.vendor == "fixerio") {
            log_error("Currency convertion error for vendor Fixerio. Falling back to Yahoo");
            // let's fall back to yahoo api
            param.vendor = "yahoo";
            xdr("https://query.yahooapis.com/v1/public/yql?q=select%20rate%2Cname%20from%20csv%20where%20url%3D'http%3A%2F%2Fdownload.finance.yahoo.com%2Fd%2Fquotes%3Fs%3D" + param.currency + optly_defaultCurrency + "%253DX%26f%3Dl1n'%20and%20columns%3D'rate%2Cname'&format=json", "get",
            param, currencyConvertorSuccess, currencyConvertorError);
        } else if (param.vendor == "yahoo") {
            log_error("Currency convertion error for vendor Yahoo. No fallback");
            // should we have a hardcoded conversion table?
            window.optimizely.push(['trackEvent', "error " + param.revenueInCents + param.currency]);
        } else {
            log_error("Currency convertion error for vendor " + param.vendor + " :" + msg);
        }
    }

    /**
     * Perform a currency conversion and send revenue
     */
    function convertCurrencyAndSendRevenue(revenueInCents, eventName, currency) {
        var rate = checkConversionRate(currency, optly_defaultCurrency);
        if (rate === null) {
            xdr("http://api.fixer.io/latest?base=" + currency, "get", {
                "vendor": "fixerio",
                    "currency": currency,
                    "eventName": eventName,
                    "revenueInCents": revenueInCents
            }, currencyConvertorSuccess, currencyConvertorError);
        } else {
            log_debug("Using stored convertion rate " + rate);
            revenueInCents = (revenueInCents * rate).toFixed(0);
            sendRevenue(revenueInCents, eventName);
        }
    }


    /**
     * Send revenue tracking to Optimizely
     * param is optional but you can use it to define currency, custom dimensions, id, etc
     * id: unique transaction id (to avoid duplication of revenue)
     * curreny: Current currency
     * to_currency: Currency to send to Optumizely (default is set in the code to USD)
     * event_name: name of the revenue event (default is purchase)
     */
    var trackRevenue = {
        trackRevenue: function (revenueInCents, param) {
            log_debug("New revenue " + revenueInCents);

            if (typeof param == "undefined") {
                param = {};
            }

            var id = param.id;
            var currency = param.currency;
            if (typeof param.to_currency != 'undefined') {
                optly_defaultCurrency = param.to_currency;
            }
            if (typeof param.event_name != 'undefined') {
                optly_eventName = param.event_name;
            }
            var eventName = optly_eventName + (typeof id == "undefined" ? '' : ' ' + id);

            window.optimizely = window.optimizely || [];

            setDimensions(param.dimensions);

            if (typeof id == "undefined" || !checkTransaction(id)) {
                if (typeof id != "undefined") {
                    saveTransaction(id);
                }

                if (typeof currency != "undefined") {
                    // we need to convert currency
                    convertCurrencyAndSendRevenue(revenueInCents, eventName, currency);
                    unsetDimensions(param.dimensions);
                } else {
                    sendRevenue(revenueInCents, eventName);
                    unsetDimensions(param.dimensions);
                }
            } else {
                // this is a duplicate revenue. Do nothing
                log_debug("Not sending duplicated revenue");
            }
        }
    };

    /**
     * show error on console
     */
    function log_error(msg) {
        console.error(msg);
    }

    /**
     * Show logging if optly_debug == true
     */
    function log_debug(msg) {
        if (optly_debug === true) {
            console.log(msg);
        }
    }

    // Add the new revenue tracking function to the optimizely Object
    function extendOptimizely(obj) {
        for (var i in obj) {
            if (obj.hasOwnProperty(i) && !optimizely.hasOwnProperty(i)) {
                optimizely[i] = obj[i];
            }
        }
    }


    // make sure Optimizely is initialised before we extend it
    var itv = setInterval(function () {
        if (typeof optimizely == 'object') {
            clearInterval(itv);
            extendOptimizely(trackRevenue);
        }
    }, 50);


})();
