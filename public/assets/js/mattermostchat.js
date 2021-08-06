/*
    Copyright (C) 2018 Bruno Spyckerelle

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program. If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * Mattermost Chat - JQuery UI Widget
 *
 * Websocket is not mandatory but many features will not work properly if disabled :
 * - Posts refresh is done via long poll
 * - No update of edited posts
 * - Update of users status only every minute
 *
 * Usage :
 * $('element').mattermostchat({
 *      baseUrl: "base url",
 *      channelId: "[optional] default channelId",
 *      teamName : "Name of the team"
 *      userName: "Login to use"
 *      serverUrl : "the url of the webserver, without protocol",
 *      minimized : "Starts minimized, default : false",
 *      acknowledgement: "Add button to acknowledge a message, default : false",
 *      utc: "Diplay datetimes in UTC. Default : false",
 *      dateFormat: "MomentJS format. Default : ddd D, HH:mm"
 * });
 *
 * @author Bruno Spyckerelle
 */

(function ($, undefined) {

    $.widget("dsna.mattermost", {
        /**
         *
         * @memberOf $
         */
        version: "0.3.0",

        //default options
        options: {
            baseUrl: "",
            userName: "",
            teamName: "",
            channelId: "",
            serverUrl:"",
            token:"",
            minimized: false,
            acknowledgement: false,
            utc: false,
            dateFormat : "ddd D, HH:mm",
            monochannel: false
        },
        myId: "",
        currentChannelId: "",
        currentChannelName: "",
        /**
         * Websocket connection
         */
        conn: null,
        connFailCount: 0,
        //timer
        timer: null,
        //lastupdate in UNIX timestamp
        lastupdate: 0,
        /**
         * True if scroll by user
         */
        userScroll: false,
        sequence: 1,
        responseCallbacks: [],
        //Array of my groups, used to monitor new messages
        groupIds: [],
        //Initialize the widget
        _create: function () {
            var self = this;

            //register events
            this.element.on('click', '.heading-groups, .unread-alert', function(){
                $(".side-two").css({
                    "left": "0"
                });
            });
            this.element.on('click', '.groups-back', function(){
                $(".side-two").css({
                    "left": "-100%"
                });
            });
            this.element.on('click', '.heading-name-meta, .heading-close, .unread-alert', function(){
                if(self.element.find('.side').is(':visible')) {
                    self.element.find('.side').hide();
                    var container = self.element.find('.container');
                    if(window.outerWidth >= 768) {
                        var newWidth = container.outerWidth() * 0.66;
                        container.css('width', newWidth+'px');
                    }
                    self.element.find('.conversation').removeClass('col-sm-8').addClass('col-sm-12');
                } else {
                    self._stopAlert();
                    self.element.find('.side').show();
                    var container = self.element.find('.container');
                    if(window.outerWidth >= 768) {
                        var newWidth = container.outerWidth() / 0.66;
                        container.css('width', newWidth+'px');
                    }
                    self.element.find('.conversation').addClass('col-sm-8').removeClass('col-sm-12');
                }
            });
            this.element.find('.heading-name-meta').trigger('click');
            if(this.options.minimized) {
                self.element.find('.app').addClass('reduce');
                self.element.find('.app-one').hide();
                self.element.find('.chat-reduce').show();
            }

            this.element.on('click', '.user', function(e){
                var me = $(this);
                var textarea = self.element.find("#comment");
                textarea.val(textarea.val()+' @'+me.data('name'));
            });

            this.element.on('submit',' #send-form', function(e){
                e.preventDefault();
                if($("#comment").val().trim().length > 0) {
                    $.post(self.options.baseUrl + '/mattermost/mattermostchat/sendMessage?channelid=' + self.currentChannelId, $("#send-form").serialize(), function (data) {
                        self._scrollToBottom(true);
                        //TODO manage errors
                    }, 'json');
                }
            });

            //on change chat
            this.element.on('click', '.group', function(event){
                var me = $(this).parent();
                if(me.data('id').localeCompare(self.currentChannelId) !== 0) {
                    self.element.find('.groups-back').trigger('click');
                    //update selected group
                    self.element.find('#groups .sideBar-time i').remove();
                    self.changeChannel(me.data('id'), me.data('name'));
                    //update unread messages
                    var numberUnread = me.find('span.unread-messages').text();
                    if(numberUnread.length > 0) {
                        numberUnread = parseInt(numberUnread);
                        var totalUnread = parseInt(self.element.find('.heading-groups span').text());
                        if(!isNaN(totalUnread)) {
                            var badge = self.element.find('.chat-reduce span.badge');
                            var newTotal = totalUnread - numberUnread;
                            if (newTotal == 0) {
                                self.element.find('.heading-groups span').text("");
                                badge.text("");
                            } else {
                                self.element.find('.heading-groups span').text(newTotal);
                                badge.text(newTotal);
                            }
                        }
                    }
                    me.find('span.unread-messages').text("");

                }
            });

            //reduce chat
            this.element.on('click', '#reduce-chat', function(event){
                self.element.find('.app').addClass('reduce');
                self.element.find('.app-one').hide();
                self.element.find('.chat-reduce').show();
            });

            //show chat
            this.element.on('click', '.chat-reduce', function(event){
                self.element.find('.app').removeClass('reduce');
                self.element.find('.app-one').show();
                self.element.find('.chat-reduce').hide();
                //update counts
                var span = self.element.find('.groupid[data-id="'+self.currentChannelId+'"] span.unread-messages');
                if(span.text().length > 0) {
                    var number = parseInt(span.text());
                    var badge = self.element.find('.chat-reduce span.badge');
                    var total = parseInt(badge.text());
                    if(total - number > 0) {
                        badge.text(total-number);
                    } else {
                        badge.text("");
                    }
                }
                self.element.find('.groupid[data-id="'+self.currentChannelId+'"] .unread-messages').text("");
                self._scrollToBottom(true);
            });

            //resize textarea if multiline
            this.element
                .one('focus.autoExpand', 'textarea.autoExpand', function(){
                    var savedValue = this.value;
                    this.value = '';
                    this.baseScrollHeight = this.scrollHeight;
                    this.value = savedValue;
                 })
                .on('input.autoExpand', 'textarea.autoExpand', function(){
                    var minRows = this.getAttribute('data-min-rows')|0, rows;
                    this.rows = minRows;
                    rows = Math.ceil((this.scrollHeight - this.baseScrollHeight) / 23);
                    this.rows = minRows + rows;
                    self.element.find('#conversation').css('height',395-22.85*rows+'px');
                    self.element.find('.reply').css('height', 60+22.85*rows+'px');
                });

            //submit on enter and newline on shift+enter
            this.element.find('#comment').keypress(function(e){
                if(e.which == 13) {
                    if(e.shiftKey) {
                        $('#comment').append($("#comment").val()+"<br />");
                    } else {
                        e.preventDefault();
                        $("#send-form").submit();
                    }
                }
                self._typing();
            });

            //detect scroll
            this.element.find('#conversation').scroll(function(event){
                var container = self.element.find('#conversation')[0];
                if (container.scrollHeight - container.scrollTop === container.clientHeight) {
                    self.userScroll = false;
                    self.element.find('.alert-new-message').hide();
                } else {
                    self.userScroll = true;
                }
            });

            this.element.on('click', '.ack', function(event){
                var postid = $(this).data('id');
                var me = $(this);
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/ack?postid='+postid, function(data){
                    if(self.connFailCount !== 0) {
                        //if no websocket, we rely on status code to know if reaction correctly added
                        if(data.result == 200) {
                            me.addClass('ack-sent').find('span').removeClass('fa-check').addClass('fa-check-square-o');
                        }
                    }
                });
            });

            this.element.on('click', "#previousMessages", function(e){
                var postid = self.element.find("#conversation .message-body").first().data('id');
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getLastPosts?channelid='+self.currentChannelId+'&beforeid='+postid, function(data){
                    self._addPosts(data, true, false);
                });
            });

            if(this.options.acknowledgement) {
                this.element.on({
                    mouseenter: function () {
                        $(this).find('.ack').show();
                    },
                    mouseleave: function () {
                        $(this).find('.ack').hide();
                    }
                }, '.message-main-sender');
            }

            //add loaders
            $(document)
                .ajaxSend(function(event, jqxhr, settings){
                    if(settings.url.indexOf('getLastPosts') > -1 && settings.url.indexOf('lastupdate') == -1) {
                        $('#conversation').addClass('load');
                        $('.chat-reduce .fa-comments').addClass('fa-spin');
                    }
                    if(settings.url.indexOf('getChannelMembers') > -1) {
                        $(".sideBar").addClass('load');
                    }
                    if(settings.url.indexOf('getMyChannels') > -1) {
                        $(".compose-sideBar").addClass('load');
                    }
                    if(settings.url.indexOf('sendMessage') > -1) {
                        $("#comment").addClass('reply-loader');
                    }
                })
                .ajaxComplete(function(event, jqxhr, settings){
                    if(settings.url.indexOf('getLastPosts') > -1 && settings.url.indexOf('lastupdate') == -1) {
                        $('#conversation').removeClass('load');
                        $('.chat-reduce .fa-comments').removeClass('fa-spin');
                    }
                    if(settings.url.indexOf('getChannelMembers') > -1) {
                        $(".sideBar").removeClass('load');
                    }
                    if(settings.url.indexOf('getMyChannels') > -1) {
                        $(".compose-sideBar").removeClass('load');
                    }
                    if(settings.url.indexOf('sendMessage') > -1) {
                        $("#comment").removeClass('reply-loader');
                        jqxhr
                            .done(function(){
                                $("#comment").val('');
                                if(self.connFailCount !== 0) { //no websocket : force refresh
                                    self._refresh();
                                }
                            })
                            .fail(function(){
                                //TODO add alert
                            });
                    }
                });

            if(self.options.monochannel == true && self.options.channelId.length > 0) {
                //disable other channels
                self.element.find('.heading-groups').hide();
            }
        },
        /* *************** */
        /*  Public methods */
        /* *************** */
        initialize : function() {
            //initialize chat
            var self = this;
            $.when(
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getDefaultChannelId?teamid=' + self.options.teamName, function (data) {
                    self.currentChannelId = data.channelid;
                }),
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getMyID', function(data){
                    self.myId = data.id;
                })
            ).then(function(data, textStatus, jqHXR){
                if (self.options.channelId.localeCompare("") !== 0) {
                    self.currentChannelId = self.options.channelId;
                }
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getchannelname?channelid=' + self.currentChannelId, function (data) {
                    self.element.find('span.channel-name').text(data.channelname);
                    self.currentChannelName = data.channelname;
                    self.changeChannel(self.currentChannelId, self.currentChannelName, false);
                });
                //get my groups once and for all
                self.element.find('.compose-sideBar ul').empty();
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getMyChannels?teamid=' + self.options.teamName, function (data) {
                    self._addGroups(data);
                });
                if(self.options.token !== "") {
                    self._websocketConnect();
                } else {
                    $.when($.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getMyToken', function (data) {
                        self.options.token = data.token;
                        Cookies.set('mattermosttoken', data.token);
                    })).then(function () {
                        self._websocketConnect();
                    });
                }
            }).fail(function(data, textStatus, jqHXR){
                self.element.find('#conversation')
                    .removeClass('load')
                    .append('<p class="bg-danger">'+data.responseJSON.detail+'</p>');
                self.element.find('.chat-reduce button').addClass('btn-danger').removeClass('btn-info');
            });
            
        },
        minimize : function() {
            this.element.find('#reduce-chat').trigger('click');
        },
        changeChannel : function(channelId, channelName, alert) {
            var self = this;
            //stop previous refresh
            if(self.timer !== null && self.connFailCount == 0) {
                clearInterval(self.timer);
            }
            //empty sideBar and conversation
            this.element.find('.sideBar ul').empty();
            this.element.find('.message-body').remove();
            this.element.find('.channel-name').text(channelName);
            //sometimes there's a race condition at startup that add the icon twice
            if(this.element.find('.groupid[data-id="' + channelId + '"] .sideBar-time i').length == 0) {
                this.element.find('.groupid[data-id="' + channelId + '"] .sideBar-time').append('<i class="fa fa-check fa-2x"></i>');
            }
            self.currentChannelId = channelId;
            $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getLastPosts?channelid='+self.currentChannelId, function(data, textStatus, jqHXR){
                self._addPosts(data, false, alert);
                if(self.connFailCount !== 0) { //no websocket : start polling
                    //periodic refresh
                    self.lastupdate = Date.now();
                    self.timer = setInterval(function () {
                        self._refresh()
                    }, 10000);
                }
            });
            //fetch members
            $.when(
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getChannelMembers?channelid='+self.currentChannelId, function(data){
                    self._addUsers(data);
                })
            ).then(
                function(){
                    if(self.connFailCount > 0) {
                        self._updateStatuses();
                    } else {
                        self._sendGetStatuses();
                    }
                }
            );
        },
        /**
         *
         * Send a message to the current channel
         * @param message
         */
        sendMessage: function(message, successCallback){
            var post = {'comment': message};
            var self = this;
            $.post(this.options.baseUrl+'/mattermost/mattermostchat/sendMessage?channelid='+this.currentChannelId, post, function(data){
                if(successCallback !== undefined) {
                    successCallback(data);
                }
                self._scrollToBottom(true);
                }, 'json');
        },
        /**
         *
         * @param message
         * @param postId
         * @param successCallback
         */
        patchMessage: function(message, postId, successCallback){
            var self = this;
            var post = {
                'comment': message,
                'postId': postId
            };
            $.post(this.options.baseUrl+'/mattermost/mattermostchat/patchMessage', post, function (data) {
                if(successCallback !== undefined) {
                    successCallback(data);
                }
            });
        },
        /**
         * Change my status
         * @param status "online" "offline" "away" or "dnd"
         */
        changeMyStatus: function(status){

        },
        /* *************** */
        /* Private Methods */
        /* *************** */

        /**
         *
         * @param data
         * @param reverse : Reverse posts order. Default: false.
         * @param alert : Alert if new posts. Default : true.
         * @private
         */
        _addPosts: function(data, reverse, alert) {
            var posts = [];
            for(var i in data)
            {
                var post = data[i];
                if(post.order !== undefined ) {
                    //TODO childs posts out of view have no order
                    posts.push(data[i]);
                }
            }
            if(reverse === undefined){
                posts.sort(function(a,b){return b.order - a.order});
            } else {
                posts.sort(function(a,b){return a.order - b.order});
            }
            var numberPosts = posts.length;
            //insert each post
            for (var i = 0; i < numberPosts; i++) {
                this._addPost(posts[i], reverse, alert);
            }
        },
        _updatePost: function(post) {
            var messages = $('.message-body').filter(function () {
                return ($(this).data('id').localeCompare(post.id) == 0);
            });
            if(messages.length == 1) {
                messages.find('.message-text').html(post.message);
                var date = moment(post.create_at);
                var editString ='';
                if(post.edit_at !== 0) {
                    editString = ' (édité le ' +
                        (this.options.utc ? moment(post.edit_at).utc().format(this.options.dateFormat) : moment(post.edit_at).format(this.options.dateFormat)) +
                        ')';
                }
                var dateString = this.options.utc ? date.utc().format(this.options.dateFormat) : date.format(this.options.dateFormat);
                var fullDateString = this.options.utc ? date.utc().format("LLLL") : date.format("LLLL");
                messages.find('.message-time').attr('title', fullDateString);
                messages.find('.message-datetime').text(dateString+editString);
            }
            //else message not displayed
            //alert if post is not mine
            if(this.myId.localeCompare(post.user_id) !== 0) {
                this._alertPost(post.channel_id);
            }
        },
        _alertPost: function(channelId, alert){
            if(this.options.monochannel == true && channelId.localeCompare(this.options.channelId) !== 0) {
                //mono channel and post in a different channel -> no alert
                return;
            }
            if(channelId.localeCompare(this.currentChannelId) == 0) {
                if(this._isMinimized() && (alert === undefined || alert == true)) {
                    if(this.groupIds.includes(channelId)) {
                        var span = this.element.find('.groupid[data-id="'+channelId+'"] span.unread-messages');
                        if(span.text().length > 0) {
                            span.text(parseInt(span.text())+1);
                        } else {
                            span.text("1");
                        }
                        var totalCount = 0;
                        $('#groups span.unread-messages').each(function(i, item){
                            var me = $(this);
                            if(me.text().length > 0){
                                totalCount += parseInt(me.text());
                            }
                        });
                        var total = this.element.find('.chat-reduce span.badge');
                        total.text(totalCount);
                    }
                }
            } else {
                if(this.groupIds.includes(channelId)) {
                    var span = this.element.find('.groupid[data-id="'+channelId+'"] span.unread-messages');
                    if(span.text().length > 0) {
                        span.text(parseInt(span.text())+1);
                    } else {
                        span.text("1");
                    }
                    var total = this.element.find('.heading-groups span');
                    var totalCount = 0;
                    $('#groups span.unread-messages').each(function(i, item){
                        var me = $(this);
                        if(me.text().length > 0){
                            totalCount += parseInt(me.text());
                        }
                    });
                    total.text(totalCount);
                    this.element.find('.chat-reduce span.badge').text(totalCount);
                    this._alert();
                }
            }
        },
        _addPost: function(data, reverse, alert) {
            var post = data;
            if (post.channel_id.localeCompare(this.currentChannelId) == 0) {
                var messages = $('.message-body').filter(function () {
                    return ($(this).data('id').localeCompare(data.id) == 0);
                });
                if (messages.length == 0) {
                    //no message with same id -> insert
                    if (this.options.userName.localeCompare(data.sender_name) == 0) {
                        this._addMyPost(data, reverse);
                    } else {
                        this._addOtherPost(data, reverse);
                    }
                }
                this._scrollToBottom();
            }
            if(this.myId.localeCompare(post.user_id) !== 0){
                this._alertPost(post.channel_id, alert);
            }
            if(this._elementsOutOfView() && !reverse) { //do not alert if reverse mode as new posts are added to the top
                this.element.find('.alert-new-message').show();
            } else {
                this.element.find('.alert-new-message').hide();
            }
        },
        _addMyPost: function(data, reverse) {
            var date = moment(data.create_at);
            var editString = '';
            if(data.edit_at !== 0) {
                editString = ' (édité le ' +
                        (this.options.utc ? moment(data.edit_at).utc().format(this.options.dateFormat) : moment(data.edit_at).format(this.options.dateFormat)) +
                        ')';
            }
            var dateString = this.options.utc ? date.utc().format(this.options.dateFormat) : date.format(this.options.dateFormat);
            var fullDateString = this.options.utc ? date.utc().format("LLLL") : date.format("LLLL");
            var post = $('<div class="row message-body"  data-id="'+data.id+'" data-user_id="'+data.user_id+'">' +
                '<div class="col-sm-12 message-main-receiver">' +
                '<div class="receiver">' +
                '<div class="message-text">' +
                data.message +
                '</div>' +
                '<span class="message-time pull-right" title="'+fullDateString+'">' +
                '<span class="message-datetime">'+dateString+editString+'</span>'+
                '</span>' +
                '</div>' +
                '</div>' +
                '</div>');
            if(data['file_ids']) {
                //this key exists only if posts came from websocket
                //we need to request the server via api
                var self = this;
                $.getJSON(this.options.baseUrl + '/mattermost/mattermostchat/getImages?filesId='+data.file_ids, function(data){
                    self._addImagesToPost(data, post);
                });
            }
            if(data['images']){
                this._addImagesToPost(data.images, post);
            }
            if(reverse === undefined) {
                var previousPost = this.element.find('.message-body').last();
                $("#conversation").append(post);
                if(previousPost.length > 0 && previousPost.data('user_id').localeCompare(data.user_id) == 0) {
                    post.addClass('following');
                    previousPost.addClass('followed');
                    if(previousPost.find('.message-datetime').text().localeCompare(dateString) == 0) {
                        previousPost.find('.message-time').addClass('mini');
                    }
                }
            } else {
                var previousPost = this.element.find('.message-body').first();
                post.insertAfter('.message-previous');
                if(previousPost.length > 0 && previousPost.data('user_id').localeCompare(data.user_id) == 0) {
                    post.addClass('followed');
                    previousPost.addClass('following');
                    if(previousPost.find('.message-datetime').text().localeCompare(dateString) == 0) {
                        post.find('.message-time').addClass('mini');
                    }
                }
            }
        },
        _addOtherPost: function(data, reverse) {
            var date = moment(data.create_at);
            var editString = '';
            if(data.edit_at !== 0) {
                var editString = ' (édité le ' +
                    (this.options.utc ? moment(data.edit_at).utc().format(this.options.dateFormat) : moment(data.edit_at).format(this.options.dateFormat)) +
                    ')';
            }
            var dateString = this.options.utc ? date.utc().format(this.options.dateFormat) : date.format(this.options.dateFormat);
            var fullDateString = this.options.utc ? date.utc().format("LLLL") : date.format("LLLL");
            var postid = data.id;
            var post = $('<div class="row message-body" data-id="'+postid+'" data-user_id="'+data.user_id+'">' +
                '<div class="col-sm-12 message-main-sender">' +
                    '<div class="sender">' +
                        '<div class="message-text">' +
                        data.message +
                        '</div>' +
                        '<span class="message-time pull-right" title="'+fullDateString+'">' +
                        data.sender_name + ' - <span class="message-datetime">' + dateString+editString+'</span>'+
                        '</span>' +
                    '</div>' +
                '</div>' +
                '</div>');
            if(this.options.acknowledgement == true) {
                $.getJSON(this.options.baseUrl + '/mattermost/mattermostchat/isack?postid=' + postid, function (data) {
                    if (data.ack == true) {
                        post.find('.message-main-sender').append('<div class="ack ack-sent"><span class="fa fa-check-square-o"></span></div>');
                    } else {
                        post.find('.message-main-sender').append('<div class="ack" title="Accuser réception" data-id="'+postid+'"><span class="fa fa-check"></span></div>');
                    }
                });
            }
            if(data['file_ids']) {
                //this key exists only if posts came from websocket
                //we need to request the server via api
                var self = this;
                $.getJSON(this.options.baseUrl + '/mattermost/mattermostchat/getImages?filesId='+data.file_ids, function(data){
                    self._addImagesToPost(data, post);
                });
            }
            if(data['images']){
                this._addImagesToPost(data.images, post);
            }

            if(reverse === undefined) {
                var previousPost = this.element.find('.message-body').last();
                $("#conversation").append(post);
                if(previousPost.length > 0 && previousPost.data('user_id').localeCompare(data.user_id) == 0) {
                    post.addClass('following');
                    previousPost.addClass('followed');
                    if(previousPost.find('.message-datetime').text().localeCompare(dateString) == 0) {
                        previousPost.find('.message-time').addClass('mini');
                    }
                }
            } else {
                var previousPost = this.element.find('.message-body').first();
                post.insertAfter('.message-previous');
                if(previousPost.length > 0 && previousPost.data('user_id').localeCompare(data.user_id) == 0) {
                    post.addClass('followed');
                    previousPost.addClass('following');
                    if(previousPost.find('.message-datetime').text().localeCompare(dateString) == 0) {
                        post.find('.message-time').addClass('mini');
                    }
                }
            }
        },
        _addImagesToPost: function(images, post) {
            var imagesDiv = $('<div class="mattermost_files"></div>');
            for(var i in images){
                var file = images[i];
                var imageDiv = $('<div class="mattermost_thumbnail"></div>');
                var image = $('<a href="'+file.file+'">')
                    .attr('data-lightbox', file.id)
                    .append('<img src="'+file.thumbnail+'">');
                image.click(function(e){
                    e.preventDefault();
                    lightbox.start($(this));
                    return false;
                });
                imageDiv.append(image);
                imagesDiv.append(imageDiv);
            }
            post.find('.message-text').append('<p>&nbsp;</p>').append(imagesDiv);
        },
        _addUsers: function(data){
            var self = this;
            var options = {
                valueNames: [
                    'fullname',
                    'lastseen',
                    'initials',
                    {data: ['id', 'name']},
                ],
                item: '<li class="list-inline user"><div class="row sideBar-body">'+
                '<div class="col-sm-3 col-xs-3 sideBar-avatar">'+
                '<span class="fa user-status user-offline"></span>'+
                '<div class="heading-avatar-circle">'+
                '<span class="heading-avatar-initials initials"></span>' +
                '</div>'+
                '</div>'+
                '<div class="col-sm-9 col-xs-9 sideBar-main">'+
                '<div class="row">'+
                '<div class="col-sm-8 col-xs-8 sideBar-name">'+
                '<span class="name-meta fullname">'+
                '</span><img title="En train d\'écrire..." src="./assets/img/ajax-loader.gif" class="user-typing">'+
                '</div>'+
                '<div class="col-sm-4 col-xs-4 pull-right sideBar-time">'+
                '<span class="time-meta pull-right lastseen">'+
                '</span>'+
                '</div>'+
                '</div>'+
                '</div>'+
                '</div></li>'
            };
            var values = [];
            for(var i in data){
                var date = moment(data[i].lastviewedat);
                var dateString = this.options.utc ? date.utc().format("ddd D, HH:mm") : date.format("ddd D, HH:mm");
                var value = {
                    id: data[i].id,
                    fullname: data[i].username,
                    name: data[i].username,
                    lastseen: dateString,
                    initials: data[i].username.charAt(0).toUpperCase()
                };
                values.push(value);
            };
            var userList = new List('users', options, values);
            this.element.find('.heading-avatar-circle').each(function(index){
                var color = self._getRandomColor();
                var textColor = self._textColor(self._hex2rgb(color));
                $(this).css('background-color', color);
                $(this).find('.heading-avatar-initials').css('color', textColor);
            });
        },
        /**
         * Update statuses via polling
         * Fall back in case websockets are not available
         * @private
         */
        _updateStatuses: function(){
            var self = this;
            $('.user').each(function(index){
                var me = $(this);
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getUserStatus?userid='+$(this).data('id'), function(data){
                    self._changeStatus(me.find('.user-status'), data.status);
                });
            });
            //refresh every minute
            setTimeout(function(){self._updateStatuses()}, 60000);
        },
        _changeStatuses: function(data) {
            for(var i in data.data) {
                this._changeStatusByUserId(i, data.data[i]);
            }
        },
        _changeStatusByUserId: function(userId, status) {
            var element = this.element.find('.user[data-id="'+userId+'"] .user-status');
            this._changeStatus(element, status);
        },
        _changeStatus: function(element, status){
            element.removeClass("user-online user-away user-offline user-dnd fa-check fa-clock-o fa-minus");
            switch (status){
                case "online":
                    element.addClass("fa-check user-online");
                    break;
                case "away":
                    element.addClass("fa-clock-o user-away");
                    break;
                case "offline":
                    element.addClass("user-offline");
                    break;
                case "dnd":
                    element.addClass("fa-minus user-dnd");
                    break;
            }
        },
        _addGroups: function(data) {
            var self = this;
            var options = {
                valueNames: [
                    'spanname',
                    'initial',
                    {data: ['id', 'name']},
                ],
                item: '<li class="list-inline groupid">' +
                '<div class="row sideBar-body group">'+
                    '<div class="col-sm-3 col-xs-3 sideBar-avatar">'+
                        '<div class="heading-avatar-circle">'+
                            '<span class="heading-avatar-initials initial"></span>' +
                        '</div>'+
                    '</div>'+
                    '<div class="col-sm-9 col-xs-9 sideBar-main">'+
                        '<div class="row">'+
                            '<div class="col-sm-8 col-xs-8 sideBar-name">'+
                                '<span class="name-meta spanname"></span>'+
                            '</div>'+
                            '<div class="col-sm-2 col-xs-2 sideBar-time">'+
                            '</div>'+
                            '<div class="col-sm-2 col-xs-2 sideBar-messages pull-right"><span class="badge unread-messages"></span></div>'+
                        '</div>'+
                    '</div>'+
                '</div></li>'
            };
            var values = [];
            var groupIds = [];
            for(var i in data) {
                if(data[i].name.length == 0){
                    //TODO add support to DM
                    continue;
                }
                var value = {
                    spanname: data[i].name,
                    initial: data[i].name.charAt(0).toUpperCase(),
                    id: data[i].id,
                    name: data[i].name
                };
                groupIds.push(data[i].id);
                values.push(value);
            }
            self.groupIds = groupIds;
            var groupList = new List('groups', options, values);
            this.element.find('.group').each(function(index){
                var color = self._getRandomColor();
                var textColor = self._textColor(self._hex2rgb(color));
                $(this).find('.heading-avatar-circle').css('background-color', color);
                $(this).find('.heading-avatar-initials').css('color', textColor);
                if(self.currentChannelId.localeCompare($(this).parent().data('id')) == 0){
                    $(this).find('.sideBar-time').append('<i class="fa fa-check fa-2x"></i>');
                }
            });
            //add unread messages
            for(var i in self.groupIds) {
                $.getJSON(this.options.baseUrl+'/mattermost/mattermostchat/getUnreadMessages?userid='+this.myId+'&channelid='+self.groupIds[i], function(data){
                    if(data.number > 0) {
                       $('li.groupid[data-id="'+self.groupIds[i]+'"] span.unread-messages').text(data.number);
                   }
                });
            }
        },
        _refresh: function() {
            var self = this;
            $.getJSON(this.options.baseUrl+'/mattermost/mattermostchat/getLastPosts?lastupdate='+self.lastupdate+'&channelid='+self.currentChannelId,
                function(data, textStatus, jqHXR){
                if(jqHXR.status !== 304) {
                    self._addPosts(data);
                }
                self.lastupdate = Date.now();
            });
        },
        /* ********************** *
         *  Web socket management *
         * ********************** */
        _websocketConnect: function() {
            var self = this;
            //create websocket connection
            self.conn = new WebSocket("wss://"+self.options.serverUrl+'/api/v4/websocket');
            self.conn.onopen = function(event){
                self.connFailCount == 0;
                self._sendWebsocketMessage("authentication_challenge",{"token": self.options.token}, null);
            };
            self.conn.onclose = function(event){
                console.log('connection closed');
                self.connFailCount++;
                if(self.connFailCount >= 3) {
                    //fall back to long poll
                    //connect to websocket fail -> fallback to long poll
                    Cookies.remove('mattermosttoken');
                    self.lastupdate = Date.now();
                    self.timer = setInterval(function () {
                        self._refresh();
                    }, 10000);
                } else {
                    //try to reconnect
                    self.conn = null;
                    self._websocketConnect();
                }
            };
            self.conn.onerror = function(event){
                self.connFailCount += 1;
                //connect to websocket fail -> fallback to long poll
                self.lastupdate = Date.now();
                self.timer = setInterval(function () {
                    self._refresh();
                }, 10000);
            };
            self.conn.onmessage = function(event) {
                //console.log(event);
                var msg = JSON.parse(event.data);
                if(msg.seq_reply) {
                    if(self.responseCallbacks[msg.seq_reply]) {
                        self.responseCallbacks[msg.seq_reply](msg);
                        delete self.responseCallbacks[msg.seq_reply];
                    }
                } else {
                    switch (msg.event) {
                        case "typing":
                            //console.log(msg);
                            break;
                        case "posted":
                            var post = JSON.parse(msg.data.post);
                            post['sender_name'] = msg.data.sender_name;
                            post['message'] = marked(post['message']); //render markdown
                            self._addPost(post);
                            //console.log(post);
                            break;
                        case "post_edited":
                            var post = JSON.parse(msg.data.post);
                            post['message'] = marked(post['message']); //render markdown
                            self._updatePost(post);
                            break;
                        case "status_change":
                            var userId = msg.data.user_id;
                            var status = msg.data.status;
                            self._changeStatusByUserId(userId, status);
                            break;
                        case "reaction_added":
                            if(self.options.acknowledgement) {
                                var reaction = JSON.parse(msg.data.reaction);
                                if(reaction.emoji_name.localeCompare("ok") == 0) {
                                    self.element
                                        .find('.ack[data-id="'+reaction.post_id+'"]').addClass('ack-sent')
                                        .find('span').removeClass('fa-check').addClass('fa-check-square-o');
                                }
                            }
                            break;
                    }
                }
            };
        },
        _sendWebsocketMessage: function(action, data, callback) {
            var msg = {
                "action": action,
                "seq": this.sequence++,
                "data": data
            };
            if(callback) {
                this.responseCallbacks[msg.seq] = callback;
            }
            if (this.conn && this.conn.readyState === WebSocket.OPEN) {
                this.conn.send(JSON.stringify(msg));
            }
        },
        _sendGetStatuses: function() {
            var self = this;
            this._sendWebsocketMessage("get_statuses", null, function(data){self._changeStatuses(data)});
        },
        _typing: function() {
            var data = {};
            data.channel_id = this.currentChannelId;
            this._sendWebsocketMessage("user_typing", data, null);
        },
        /**
         * Return true is chat is minimized
         * @private
         */
        _isMinimized: function() {
            return this.element.find('.app').hasClass('reduce');
        },
        _alert: function() {
            if(!(this.element.find('.side').css('display') == 'block')) {
                this.element.find('.app-one').css('overflow', 'visible');
                this.element.find('.unread-alert').show();
            }
        },
        _stopAlert: function() {
            this.element.find('.app-one').css('overflow', 'hidden');
            this.element.find('.unread-alert').hide();
        },
        /** Utilitary methods */
        _yiq: function(rgb) {
            return 1 - (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114)/255;
        },
        _textColor: function(rgb) {
            if(this._yiq(rgb) < 0.5) {
                return "#000";
            } else {
                return "#fff";
            }
        },
        _getRandomColor: function() {
            var letters = '0123456789ABCDEF';
            var color = '#';
            for (var i = 0; i < 6; i++) {
                color += letters[Math.floor(Math.random() * 16)];
            }
            return color;
        },
        _hexdec: function(hexString){
            hexString = (hexString + '').replace(/[^a-f0-9]/gi, '');
            return parseInt(hexString, 16);
        },
        _hex2rgb: function(color) {
            var hex = color.replace("#", "");

            if(hex.length == 3) {
                var r = this._hexdec(hex.substr(0,1).substr(0,1));
                var g = this._hexdec(hex.substr(1,1).substr(1,1));
                var b = this._hexdec(hex.substr(2,1).substr(2,1));
            } else {
                var r = this._hexdec(hex.substr(0,2));
                var g = this._hexdec(hex.substr(2,2));
                var b = this._hexdec(hex.substr(4,2));
            }
            return [r, g, b];
        },
        /**
         *
         * @param force
         * @private
         */
        _scrollToBottom: function(force) {
            force = (typeof force !== 'undefined') ? force : false;
            var container = this.element.find('#conversation');
            if (!this.userScroll || force == true) {
                //go to the last message only if no user scroll
                container.scrollTop(container[0].scrollHeight);
                //force hide unread messages
                this.element.find('.alert-new-message').hide();
            }
        },
        _elementsOutOfView:function() {
            var innerHeight = window.innerHeight;
            var outOfView = false;
            $('.message-body').each(function(index, element){
                if(element.getBoundingClientRect().y + element.getBoundingClientRect().height > innerHeight) {
                    outOfView = true;
                    return false; //break loop
                }
            });
            return outOfView;
        }
    });
})(jQuery);
