<?php
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

namespace MattermostMessenger\Controller;
use MaglMarkdown\Service\Markdown;
use MattermostMessenger\Service\MattermostService;
use Zend\Mvc\Controller\AbstractActionController;
use Zend\View\Model\JsonModel;


/**
 * Class MattermostChatController
 * @package Application\Controller
 */
class MattermostChatController extends AbstractActionController
{

    private $mattermost;
    private $markdownService;

    public function __construct(MattermostService $mattermost, Markdown $markdown)
    {
        $this->mattermost = $mattermost;
        $this->markdownService = $markdown;
    }

    public function sendMessageAction()
    {
        $json = array();
        $channelid = $this->params()->fromQuery('channelid', null);
        if ($this->getRequest()->isPost()) {
            $post = $this->getRequest()->getPost();
            $result = $this->mattermost->sendMessageToChannel($post['comment'], $channelid);
            $json['result'] = $result;
        }
        return new JsonModel($json);
    }

    public function getLastPostsAction()
    {
        $json = array();
        $postid = $this->params()->fromQuery('lastid', null);
        $channelid = $this->params()->fromQuery('channelid', null);
        $since = $this->params()->fromQuery('lastupdate', null);
        if($postid == null && $since == null) {
            $posts = $this->mattermost->getLastPostsFromChannel($channelid);
        } else if($postid !== null) {
            $posts = $this->mattermost->getLastPostsFromChannelAfter($channelid, $postid);
        } else if($since !== null) {
            $posts = $this->mattermost->getLastPostsFromChannelSince($channelid, $since);
        }
        foreach ($posts->order as $key => $value) {
            $json[$value]['order'] = $key;
        }
        foreach ($posts->posts as $key => $value) {
            $json[$key]['user_id'] = $value->user_id;
            $json[$key]['sender_name'] = $this->mattermost->getUsername($value->user_id);
            $json[$key]['message'] = $this->markdownService->render(str_replace("\n", "\n\n", $value->message));
            $json[$key]['update_at'] = $value->update_at;
            $json[$key]['id'] = $key;
        }
        return new JsonModel($json);
    }

    public function getChannelMembersAction()
    {
        $json = array();
        $channelid = $this->params()->fromQuery('channelid', null);
        $page = 0;
        $members = array();
        while(count($members) == 60 || $page == 0) {
            $members = $this->mattermost->getChannelMembers($channelid, $page);
            $i = 0;
            foreach ($members as $member) {
                $m = array();
                $m['id'] = $member->user_id;
                $m['username'] = $this->mattermost->getUsername($member->user_id);
                $m['picture'] = $this->mattermost->getUserPicture($member->user_id);
                $m['lastviewedat'] = $member->last_viewed_at;
                $json[] = $m;
                $i++;
            }
            $page++;
        }
        return new JsonModel($json);
    }

    public function getUserStatusAction()
    {
        $userId = $this->params()->fromQuery('userid', null);
        return new JsonModel(array("status"=>$this->mattermost->getUserStatus($userId)));
    }

    public function getMyChannelsAction() {
        $json = array();
        $teamid = $this->params()->fromQuery('teamid', null);
        if($teamid !== null) {
            $channels = $this->mattermost->getMyChannelsByTeamName($teamid);
            foreach ($channels as $channel) {
                $chan = array();
                $chan['name'] = $this->mattermost->getChannelName($channel->id);
                $chan['id'] = $channel->id;
                $json[] = $chan;
            }
        }
        return new JsonModel($json);
    }

    public function getDefaultChannelIdAction() {
        $json = array();
        $teamid = $this->params()->fromQuery('teamid', null);
        $channelid = $this->mattermost->getMyChannelsByTeamName($teamid)[0]->id;
        $json['channelid'] = $channelid;
        return new JsonModel($json);
    }

    public function getChannelNameAction() {
        $json = array();
        $channelid = $this->params()->fromQuery('channelid', null);
        $channelname = $this->mattermost->getChannelName($channelid);
        $json['channelname'] = $channelname;
        return new JsonModel($json);
    }

    public function ackAction()
    {
        $json = array();
        $postId = $this->params()->fromQuery('postid', null);
        $response = $this->mattermost->saveReaction($postId, 'ok');
        $json['result'] = $response;
        return new JsonModel($json);
    }

    public function getReactionsAction()
    {
        $json = array();
        $postId = $this->params()->fromQuery('postid', null);
        $response = $this->mattermost->getReactions($postId);
        foreach ($response as $reaction) {
            $r = array();
            $r['user_id'] = $reaction['user_id'];
            $r['post_id'] = $reaction['post_id'];
            $r['emoji_name'] = $reaction['emoji_name'];
            $json[] = $r;
        }
        return new JsonModel($json);
    }

    public function isAckAction()
    {
        $json = array();
        $postId = $this->params()->fromQuery('postid', null);
        $myReactions = $this->mattermost->getMyReactions($postId);
        $ok = array_filter($myReactions, function($v){
            return strcmp($v['emoji_name'], 'ok') == 0;
        });
        $json['ack'] = count($ok) == 1;
        return new JsonModel($json);
    }

}