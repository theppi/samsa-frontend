/* globals Ui:false*/
/* globals angular: true*/
/* globals $: true*/
/* globals AmazonCognitoIdentity: true,AWS: true, AWSCognito: true*/
const serviceEndpoint = "https://bgfkzksks6.execute-api.eu-central-1.amazonaws.com/dev",
      UserPoolId = "eu-central-1_vNtxRA70d",
      ClientId = "751fnnqflh1cafbqhtiumokt37";
var Ui = {
    config: {
        cognito: {
            UserPoolId: UserPoolId,
            ClientId: ClientId,
            region: 'eu-central-1'
        },
        api: {
            userVerification: serviceEndpoint + "/user/verify",
            purchaseVerification: function(a,b,c) {
                return [
                    serviceEndpoint,
                    a, "verify", b, c 
                ].join("/");
            },
            assignPurchase: serviceEndpoint + "/purchase/assign"
        }
    },
    getApp: function () {
        return angular.module("samsa");
    },
    userPool: new AmazonCognitoIdentity.CognitoUserPool({
        UserPoolId: UserPoolId,
        ClientId: ClientId,
        region: 'eu-central-1'
    }) 
};

Ui.app = angular.module("samsa", ['ngRoute']).constant('config', Ui.config);

Ui.app.config(function ($interpolateProvider, $routeProvider, $sceDelegateProvider) {
    $interpolateProvider.startSymbol('[[');
    $interpolateProvider.endSymbol(']]');
    $routeProvider
        .when('/', {
            templateUrl: function () {
                let currentUser = Ui.userPool.getCurrentUser();
                if (!currentUser) return 'views/login.html';
                return 'views/start.html';
            }
        })
        .when('/:temp', {
            templateUrl: function (params) {
                if (!Ui.userPool.getCurrentUser() && params.temp != "signup") return 'views/login.html';
                return 'views/' + params.temp + '.html';
            }
        })
        .when('/:temp/:id/:key', {
            templateUrl: function (params) {
                return 'views/' + params.temp + '.html';
            }
        }).otherwise({
            redirectTo: "/"
        });
    $sceDelegateProvider.resourceUrlWhitelist([
        // Allow same origin resource loads.
        'self',
        // Allow loading from our assets domain.  Notice the difference between * and **.
        'http://*.*.*/**'
    ]);
});
Ui.app.service("cognito", function ($rootScope, config) {
    let userPool = Ui.userPool;//new AmazonCognitoIdentity.CognitoUserPool(poolData);
    if (typeof AWS !== 'undefined') {
        AWS.config.region = config.cognito.region;
    }

    let signOut = function signOut() {
        userPool.getCurrentUser().signOut();
    };

    let authToken = new Promise(function fetchCurrentAuthToken(resolve, reject) {
        var cognitoUser = userPool.getCurrentUser();
        if (cognitoUser) {
            cognitoUser.getSession(function sessionCallback(err, session) {
                if (err) {
                    reject(err);
                } else if (!session.isValid()) {
                    resolve(null);
                } else {
                    resolve(session.getIdToken().getJwtToken());
                }
            });
        } else {
            resolve(null);
        }
    });
    
    function register(email, password, onFailure, onSuccess) {
        var dataEmail = {
            Name: 'email',
            Value: email
        };
        var attributeEmail = new AmazonCognitoIdentity.CognitoUserAttribute(dataEmail);
        
        userPool.signUp(email, password, [attributeEmail], null,
            function(err, result) {
                if (!err) {
                    onSuccess(result);
                } else {
                    onFailure(err);
                }
            }
        );
    }

    function signin(email, password, onSuccess, onFailure) {
        let authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
            Username: email,
            Password: password
        });

        let cognitoUser = createCognitoUser(email);
        cognitoUser.authenticateUser(authenticationDetails, {
            onSuccess: onSuccess,
            onFailure: onFailure
        });
    }

    function resend(user) {
        let cognitoUser = createCognitoUser(user);
        cognitoUser.resendConfirmationCode(function(err, result) {
            if (err) {
                console.log(err);
                return;
            }
        });
    }
    function createCognitoUser(email) {
        return new AmazonCognitoIdentity.CognitoUser({
            Username: email,
            Pool: userPool
        });
    }
    
    function getSession() {
        return new Promise((resolve, reject) => {
            let user = Ui.userPool.getCurrentUser();
            if(!user) resolve(null);
            user.getSession((err, ses) => {
                if(err) reject(err);
                else resolve(ses);
            });
        });
    }

    return {
        signup: register,
        login: signin,
        logout: signOut,
        authToken: authToken,
        resend: resend,
        session: getSession
    };
})
    .service("message", function($rootScope) {
        $rootScope.modal = {
            info:{
                title: "",
                body: ""
            },
            dialog:{
                title: "",
                body: "",
                action: function() {}
            }
        };
        return {
            info: function(title, body, digest) {
                $rootScope.modal.info.title = title;
                $rootScope.modal.info.body = body;
                if(digest) {
                    $rootScope.$digest();
                }
                $("#info-modal").modal("show");
            },
        };
        
    })
    .service("communicator", function(config) {
        function getToken() {
            return new Promise((resolve, reject) => {
                let user = Ui.userPool.getCurrentUser();
                if(!user) resolve(null);
                user.getSession((err, ses) => {
                    if(err) resolve(null);
                    else {
                        resolve(ses.getIdToken().jwtToken);
                    }
                });
            });
        }
        let ajax = async (url, method, data, onSuccess, onFailure) => {
            let request = {
                method: method,
                url: url,
                headers: {},
                contentType: 'application/json',
                success: onSuccess,
                error: onFailure
            };
            let authToken = await getToken();
            if(authToken) request.headers.Authorization = authToken;
            if(data) request.data = JSON.stringify(data);
            try {
                return await $.ajax(request);
            } catch(e) {
                onFailure(e);
            }
        };
        return {
            post: function(url, data, onSuccess, onFailure) {
                return ajax(url, "POST", data, onSuccess, onFailure);
            },
            get: function(url, onSuccess, onFailure) {
                return ajax(url, "GET", null, onSuccess, onFailure);
            }
        };
    });
    
// $scope.$on('MESSAGE.INFO', function (event, data) {
//     $scope.showMessage('info', data);
// });

// $scope.$on('MESSAGE.WARN', function (event, data) {
//     $scope.showMessage('warn', data);
// });

// $scope.$on('MESSAGE.ERROR', function (event, data) {
//     $scope.showMessage('error', data);
// });

Ui.app.controller("_rootController", ["$scope", "$rootScope", "$location",  "config", "cognito","message","communicator", async function ($scope, $rootScope, $location, config, cognito, message, communicator) {
    $rootScope.config = config;
    $scope.path = $location.path().split("/").filter(x => x);
    $scope.app = {};
    $scope.logout = () => {
        $("#sidebar").hide();
        Ui.userPool.getCurrentUser().signOut();
        localStorage.removeItem("purchase_id");
        localStorage.removeItem("purchase_id_key");
        $location.path("/login");
    };

    let assignPurchaseInternal = (session, id, key, callback) => {
        let data = {
            purchaseId: id,
            key: key
        };
        communicator.post(config.api.assignPurchase, data,
            function(res) {
                localStorage.removeItem("purchase_id");
                localStorage.removeItem("purchase_id_key");
                message.info("Message from Samsa", "Your subscription has been assigned", true);
                callback(null, res);
            },function(err) {
                console.error(err);
                localStorage.removeItem("purchase_id");
                localStorage.removeItem("purchase_id_key");
                callback(err, null);
            });
    };
    $scope.assignPurchaseInternal = assignPurchaseInternal;
    $scope.assignPurchase = (callback) => {
        let purchaseId = window.localStorage.getItem("purchase_id");
        let currentUser = Ui.userPool.getCurrentUser();
        if(currentUser && purchaseId) {
            let purchaseKey = window.localStorage.getItem("purchase_id_key");
            currentUser.getSession((err, session) => {
                assignPurchaseInternal(session, purchaseId, purchaseKey, callback);
            });
        }
    };

    $scope.goto = (path) => {
        $(".modal").modal("hide");
        $(".modal-backdrop").modal("hide");
        $location.path("/" + path);
    };

    $rootScope.init = function () {
        $scope.assignPurchase();
        cognito.authToken.then(function setAuthToken(token) {
            if (token) {
                $rootScope.authToken = token;
            } else {
                delete $rootScope.authToken;
            }
        }).catch(function handleTokenError(error) {
            // window.location.href = '#!/signin';
        });
    };
    $rootScope.init();

    $(document).ready(function () {
        let navItems = $("#sidebar .nav-item");
        navItems.each((i, item) => {
            let _item = $(item);
            let link = _item.find("a").attr("href").split("#!").filter(x => x)[0];
            if ($location.path() == link) {
                _item.addClass("active");
            } else {
                _item.removeClass("active");
            }
        });
        navItems.click((element) => {
            navItems.removeClass("active");
            $(element).addClass("active");
        });
    });
}]);
Ui.app.controller("index", [async function () {
    $("#sidebar, #user-button").show();
}])
    .controller("purchase", ["$scope", "$location", "config", async function ($scope,$location, config) {
        $("#sidebar, #user-button").hide();
        $("#loading-img").show();
        let url = config.api.purchaseVerification( $scope.path[0], $scope.path[1],$scope.path[2]);
        $.get(url).then(res => {
            let currentUser = Ui.userPool.getCurrentUser();
            if(res) {
                if(currentUser) {
                    currentUser.getSession((err, session) => {
                        $scope.assignPurchaseInternal(session, $scope.path[1], $scope.path[2], (err, res)=> {
                            window.location = "#!/purchase";
                            $("#valid-purchase-internal").show();
                            $("#loading-img").hide();
                            $("#sidebar, #user-button").show();
                        });
                    });
                } else {
                    $("#valid-purchase").show();
                    $("#loading-img").hide();
                    window.localStorage.setItem("purchase_id", $scope.path[1]);
                    localStorage.setItem("purchase_id_key", $scope.path[2]);
                }
            } else {
                $("#invalid-purchase").show();
                $("#loading-img").hide();
            }
        }).catch((err) => {
            console.error(err);
            $("#invalid-purchase").show();
            $("#loading-img").hide();
        });
    }])
    .controller("subscriptions", ["$scope","communicator", async function ($scope, communicator) {
        $("#sidebar, #user-button").show();
        communicator.get(serviceEndpoint + "/subscriptions", 
            function(res) {
                $scope.subscriptions = res.Items;
                let options = { year: 'numeric', month: 'numeric', day: 'numeric' };
                $scope.subscriptions.forEach(sub => {
                    sub.nextBillingDate.S = new Date(sub.nextBillingDate.S).toLocaleDateString('de-DE', options);
                    return sub;
                });
                $scope.$apply();
            },
            function(err) {
                console.error(err);
            });
    }])
    .controller("login", ["$scope", "cognito","message", async function ($scope, cognito, message) {
        $("#sidebar, #user-button").hide();
        $scope.login = (event) => {
            var email = $('#login-container #email').val();
            var password = $('#login-container #password').val();
            cognito.login(email, password,
                function signinSuccess(cognitoUserSession) {
                    $scope.assignPurchase();
                    window.location = '#!/start';
                },
                function signinError(err) {
                    switch(err.code) {
                    case "UserNotConfirmedException":
                        message.info("Not confirmed", "Your account seems not yet to be confirmed. " + 
                            "Please check your emails for our verification email.", true);
                        break;
                    case "UserNotFoundException":
                        message.info("Not registered", "You don't seem to have an account yet. " + 
                            "Please sign up to manage RealObjects subscriptions.", true);
                        break;
                    default:
                        console.log(JSON.stringify(err, null, 2));
                    }
                    
                }
            );
        };
        $scope.resend = function(event) {
            $("#resend-modal").modal("show");
        };
        $scope.send = function(event) {
            let user = $("#resend-modal-input").val();
            cognito.resend(user);
        };
    }])
    .controller("signup", ["$scope", "cognito", async function ($scope, cognito) {
        $("#sidebar, #user-button").hide();
        $scope.register = function (event) {
            let userData = {};
            let forms = $("#" + $(event.currentTarget).attr("submit")).find("input");
            forms.each((i, form) => {
                let _form = $(form);
                userData[_form.attr("id")] = _form.val();
            });
            if (userData.inputPassword !== userData.confirmPassword) {
                alert("Password and confirmation are not the same.");
            } else {
                cognito.signup(userData.inputEmail, userData.inputPassword, function (err) {
                    console.log(err);
                }, function(res) {
                    $("#signupModal").modal("show");
                });
            }
        };
        
    }])
    .controller("user", ["$scope", "config", async function ($scope,config) {
        $("#loading-img").show();
        try {
            let validation = await $.post(config.api.userVerification, JSON.stringify({
                user: $scope.path[1],
                key: $scope.path[2]
            }));
            $("#loading-img").hide();
            if(validation.valid) {
                $("#user-valid").show();
            } else {
                $("#user-invalid").show();
            }
        } catch(e) {
            $("#user-invalid").show();
        }
    }]);