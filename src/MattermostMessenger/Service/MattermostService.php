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
namespace MattermostMessenger\Service;


use Gnello\Mattermost\Driver;
use Pimple\Container;
use Psr\Http\Message\ResponseInterface;

/**
 * Class MattermostService
 * @package MattermostMessenger\Service
 */
class MattermostService
{

    protected $mattermost;

    protected $client;

    protected $myId;

    protected $token;

    public function __construct($config)
    {
        $this->mattermost = $config['mattermost'];
    }

    protected function getClient()
    {
        if($this->client == null) {
            $containerOptions = array(
                'driver' => array(
                    'url' => $this->mattermost['server_url'],
                    'login_id' => $this->mattermost['login'],
                    'password' => $this->mattermost['password']
                )
            );
            if(array_key_exists('proxy', $this->mattermost)) {
                $containerOptions['guzzle'] = array(
                    'proxy' => [
                        'http'  => $this->mattermost['proxy'],
                        'https' => $this->mattermost['proxy'],
                    ]
                );
            }
            $container = new Container($containerOptions);
            $this->client = new Driver($container);
            $result = $this->client->authenticate();
            if($result->getStatusCode() == 200) {
                //OK !
                $this->myId = json_decode($result->getBody())->id;
                $this->token = $result->getHeader('Token')[0];
            } else {
                error_log("Impossible de s'authentifier au serveur, erreur ".$result->getStatusCode());
            }
        }
        return $this->client;
    }

    public function getToken(){
        if(!$this->token){
            $this->getClient();
        }
        return $this->token;
    }

    public function getMyId()
    {
        if(!$this->myId){
            $this->getClient();
        }
        return $this->myId;
    }

    public function getServerUrl()
    {
        return $this->mattermost['server_url'];
    }

    public function getTeamName()
    {
        return $this->mattermost['team_id'];
    }

    /**
     * @param $message
     * @param $channelId
     * @return ResponseInterface
     */
    public function sendMessageToChannel($message, $channelId)
    {
        $requestOptions = array(
            'channel_id' => $channelId,
            'message' => $message
        );
        $result = $this->getClient()->getPostModel()->createPost($requestOptions);
        return $result;
    }

    /**
     * @param $postId
     * @param $message
     * @return ResponseInterface
     */
    public function patchMessage($postId, $message)
    {
        $requestOptions = array(
            'message' => $message
        );
        $result = $this->getClient()->getPostModel()->patchPost($postId, $requestOptions);
        return $result;
    }

    /**
     * @param $channelId
     * @param int $number
     * @return mixed
     * @throws \Exception
     */
    public function getLastPostsFromChannel($channelId, $number = 20)
    {
        $requestOptions = array(
            'per_page' => $number
        );
        $result = $this->getClient()->getPostModel()->getPostsForChannel($channelId, $requestOptions);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les posts. Erreur ".$result->getStatusCode()." : ".$result->getBody());
        }
    }

    public function getLastPostsFromChannelSince($channelId, $time)
    {
        $requestOptions = array(
            'since' => $time
        );
        $result = $this->getClient()->getPostModel()->getPostsForChannel($channelId, $requestOptions);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les posts. Erreur ".$result->getStatusCode());
        }
    }

    public function getLastPostsFromChannelAfter($channelId, $postId)
    {
        $requestOptions = array(
            'after' => $postId
        );
        $result = $this->getClient()->getPostModel()->getPostsForChannel($channelId, $requestOptions);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les posts. Erreur ".$result->getStatusCode());
        }
    }

    /**
     * @param $channelId
     * @param $postId
     * @return mixed Last 15 posts before $postId
     * @throws \Exception
     */
    public function getLastPostsFromChannelBefore($channelId, $postId)
    {
        $requestOptions = array(
            'before' => $postId,
            'per_page' => 15
        );
        $result = $this->getClient()->getPostModel()->getPostsForChannel($channelId, $requestOptions);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les posts. Erreur ".$result->getStatusCode());
        }
    }

    public function getPost($id)
    {
        $result = $this->getClient()->getPostModel()->getPost($id);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer le post");
        }
    }

    public function getUsername($userid){
        $result = $this->getClient()->getUserModel()->getUser($userid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody())->username;
        } else {
            throw new \Exception("Impossible de récupérer l'utilisateur.");
        }
    }

    public function getUserPicture($userid) {
        $result = $this->getClient()->getUserModel()->getUserProfileImage($userid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            return null;
        }
    }

    public function getTeamId($teamname)
    {
        $result = $this->getClient()->getTeamModel()->getTeamByName($teamname);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody())->id;
        } else {
            throw new \Exception("Impossible de récupérer l'équipe. Erreur ".$result->getStatusCode());
        }
    }

    public function getChannelMembers($channelId, $page = 0)
    {
        $requestOptions = array('page' => $page);
        $result = $this->getClient()->getChannelModel()->getChannelMembers($channelId, $requestOptions);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les utilisateurs.");
        }
    }

    public function getMyChannelsByTeamName($teamName)
    {
        $teamId = $this->getTeamId($teamName);
        return $this->getMyChannels($teamId);
    }

    public function getMyChannels($teamid)
    {
        $result = $this->getClient()->getChannelModel()->getChannelsForUser('me', $teamid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les canaux. Erreur ".$result->getStatusCode());
        }
    }

    public function getChannelName($channelid)
    {
        $result = $this->getClient()->getChannelModel()->getChannel($channelid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody())->display_name;
        } else {
            throw new \Exception("Impossible de récupérer le canal. Erreur ".$result->getStatusCode());
        }
    }

    public function getUserStatus($userid)
    {
        $result = $this->getClient()->getUserModel()->getUserStatus($userid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody())->status;
        } else {
            throw new \Exception("Impossible de récupérer le statut. Erreur ".$result->getStatusCode());
        }
    }

    public function getUserStatusesById()
    {
        $result = $this->getClient()->getUserModel()->getUserStatusesById();
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les statuts. Erreur ".$result->getStatusCode());
        }
    }

    public function saveReaction($postId, $emojiName)
    {
        $requestOptions = array(
            'user_id' => $this->getMyId(),
            'post_id' => $postId,
            'emoji_name' => $emojiName
        );
        $result = $this->getClient()->getReactionModel()->saveReaction($requestOptions);
        if($result->getStatusCode() !== 200) {
            error_log(print_r(json_decode($result->getBody()), true));
        }
        return $result->getStatusCode();
    }

    public function getReactions($postId)
    {
        $result = $this->getClient()->getPostModel()->getReactions($postId);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            error_log(print_r(json_decode($result->getBody()), true));
        }
    }

    public function getMyReactions($postId)
    {
        $result = $this->getClient()->getPostModel()->getReactions($postId);
        if($result->getStatusCode() == 200) {
            $reactions = json_decode($result->getBody(), true);
            $myReactions = array_filter($reactions, function($v){
                return strcmp($v['user_id'], $this->getMyId()) == 0;
            });
            return $myReactions;
        } else {
            error_log(print_r(json_decode($result->getBody()), true));
        }
    }

    public function getFileThumbnail($fileId)
    {
        $result = $this->getClient()->getFileModel()->getFilesThumbnail($fileId);
        if($result->getStatusCode() == 200) {
            return $result->getBody();
        } else {
            error_log('Erreur '.$result->getStatusCode());
            error_log(print_r(json_decode($result->getBody()), true));
        }
    }

    public function getFile($fileId)
    {
        $result = $this->getClient()->getFileModel()->getFile($fileId);
        if($result->getStatusCode() == 200) {
            return $result->getBody();
        } else {
            error_log('Erreur '.$result->getStatusCode());
            error_log(print_r(json_decode($result->getBody()), true));
        }
    }
}

