import ZegoExpressEngine, {
  ZegoUser,
  ZegoRoomConfig,
  ZegoEngineProfile,
  ZegoView,
  ZegoViewMode,
  ZegoUpdateType,
  ZegoRemoteDeviceState,
  ZegoPublishStreamQuality,
  ZegoPlayStreamQuality,
  ZegoStream,
  ZegoRoomState,
} from 'zego-express-engine-reactnative';

import {
  ZegoDeviceUpdateType,
  ZegoMediaOptions,
  ZegoParticipant,
} from './index.entity';

/// A wrapper for using ZegoExpressEngine's methods
///
/// We do some basic logic inside this class, if you use it somewhere then we will recommend you use it anywhere.
/// If you don't understand ZegoExpressEngine very well, do not mix two of the class on your code.
/// Instead you should use every methods call of ZegoExpressEngine inside this class
/// and do everything you want via ZegoExpressManager
/// Read more about ZegoExpressEngine: https://docs.zegocloud.com/article/13577
export class ZegoExpressManager {
  // key is UserID, value is participant model
  private participantDic: Map<string, ZegoParticipant> = new Map();
  // key is streamID, value is participant model
  private streamDic: Map<string, ZegoParticipant> = new Map();
  private localParticipant!: ZegoParticipant;
  private roomID = '';
  private mediaOptions: ZegoMediaOptions[] = [];
  private deviceUpdateCallback: ((
    updateType: ZegoDeviceUpdateType,
    userID: string,
    roomID: string,
  ) => void)[] = [];
  static shared: ZegoExpressManager;
  private constructor() {
    if (!ZegoExpressManager.shared) {
      this.localParticipant = {} as ZegoParticipant;
      ZegoExpressManager.shared = this;
    }
    return ZegoExpressManager.shared;
  }
  /// Instance of ZegoExpressManager
  ///
  /// You should call all of the method via this instance
  static instance() {
    return ZegoExpressManager.shared;
  }

  /// Create SDK instance and setup some callbacks
  ///
  /// You need to call createEngine before call any of other methods of the SDK
  /// Read more about it: https://doc-en-api.zego.im/ReactNative/classes/_zegoexpressengine_.zegoexpressengine.html#createengine
  static createEngine(profile: ZegoEngineProfile): Promise<ZegoExpressEngine> {
    ZegoExpressManager.shared = new ZegoExpressManager();
    return ZegoExpressEngine.createEngineWithProfile(profile).then(
      (engine: ZegoExpressEngine) => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][createEngineWithProfile] - Create success',
        );
        ZegoExpressManager.shared.onOtherEvent();
        return engine;
      },
    );
  }
  /// User [user] joins into the room with id [roomID] with [options] and then can talk to others who are in the room
  ///
  /// Options are different from scenario to scenario, here are some example
  /// Video Call: [ZegoMediaOption.autoPlayVideo, ZegoMediaOption.autoPlayAudio, ZegoMediaOption.publishLocalAudio, ZegoMediaOption.publishLocalVideo]
  /// Live Streaming: - host: [ZegoMediaOption.autoPlayVideo, ZegoMediaOption.autoPlayAudio, ZegoMediaOption.publishLocalAudio, ZegoMediaOption.publishLocalVideo]
  /// Live Streaming: - audience:[ZegoMediaOption.autoPlayVideo, ZegoMediaOption.autoPlayAudio]
  /// Chat Room: - host:[ZegoMediaOption.autoPlayAudio, ZegoMediaOption.publishLocalAudio]
  /// Chat Room: - audience:[ZegoMediaOption.autoPlayAudio]
  joinRoom(
    roomID: string,
    token: string,
    user: ZegoUser,
    options: ZegoMediaOptions[],
  ): Promise<boolean> {
    if (!token) {
      console.error(
        '[ZEGOCLOUD LOG][Manager][joinRoom] - Token is empty, please enter a right token',
      );
      return Promise.resolve(false);
    }
    if (!options) {
      console.error(
        '[ZEGOCLOUD LOG][Manager][joinRoom] - Options is empty, please enter a right options',
      );
      return Promise.resolve(false);
    }
    this.roomID = roomID;
    this.mediaOptions = options;

    this.localParticipant.userID = user.userID;
    this.localParticipant.name = user.userName;
    this.localParticipant.streamID = this.generateStreamID(user.userID, roomID);

    this.participantDic.set(
      this.localParticipant.userID,
      this.localParticipant,
    );
    this.streamDic.set(this.localParticipant.streamID, this.localParticipant);

    const roomConfig = new ZegoRoomConfig(0, true, token);
    return ZegoExpressEngine.instance()
      .loginRoom(roomID, user, roomConfig)
      .then(async () => {
        console.warn('[ZEGOCLOUD LOG][Manager][loginRoom] - Login success');
        this.localParticipant.camera = this.mediaOptions.includes(
          ZegoMediaOptions.PublishLocalVideo,
        );
        this.localParticipant.mic = this.mediaOptions.includes(
          ZegoMediaOptions.PublishLocalAudio,
        );
        if (this.localParticipant.camera || this.localParticipant.mic) {
          await ZegoExpressEngine.instance().startPublishingStream(
            this.localParticipant.streamID,
          );
          console.warn(
            '[ZEGOCLOUD LOG][Manager][startPublishingStream] - Publish success',
          );
          await ZegoExpressEngine.instance().enableCamera(
            this.localParticipant.camera,
          );
          await ZegoExpressEngine.instance().muteMicrophone(
            !this.localParticipant.mic,
          );
          console.warn(
            '[ZEGOCLOUD LOG][Manager][enableCamera] - Enable success',
            this.localParticipant.camera,
          );
          console.warn(
            '[ZEGOCLOUD LOG][Manager][muteMicrophone] - Mute success',
            !this.localParticipant.mic,
          );
        }
        return true;
      });
  }
  /// Turn on your camera if [enable] is true
  enableCamera(enable: boolean): Promise<void> {
    this.localParticipant.camera = enable;
    return ZegoExpressEngine.instance()
      .enableCamera(enable)
      .then(() => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][enableCamera] - Enable success',
          enable,
        );
      });
  }
  /// Turn on your microphone if [enable] is true
  enableMic(enable: boolean): Promise<void> {
    this.localParticipant.mic = enable;
    return ZegoExpressEngine.instance()
      .muteMicrophone(!enable)
      .then(() => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][muteMicrophone] - Mute success',
          !enable,
        );
      });
  }
  /// Set the tag value of ref control which can obtain by findNodeHandle method to render your own video
  setLocalVideoView(renderView: number) {
    if (!this.roomID) {
      console.error(
        '[ZEGOCLOUD LOG][Manager][setLocalVideoView] - You need to join the room first and then set the videoView',
      );
      return;
    }
    if (renderView === null) {
      console.error(
        '[ZEGOCLOUD LOG][Manager][setLocalVideoView] - You need to pass in the correct element',
      );
      return;
    }
    const zegoView = new ZegoView(renderView, ZegoViewMode.AspectFit, 0);
    ZegoExpressEngine.instance()
      .startPreview(zegoView)
      .then(() => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][startPreview] - Preview success',
        );
      });
  }
  /// Set the tag value of ref control which can obtain by findNodeHandle method to render video of user with id [userID]
  setRemoteVideoView(userID: string, renderView: number) {
    if (renderView === null) {
      console.error(
        '[ZEGOCLOUD LOG][Manager][setRemoteVideoView] - You need to pass in the correct element',
      );
      return;
    }
    if (!userID) {
      console.error(
        '[ZEGOCLOUD LOG][Manager][setRemoteVideoView] - UserID is empty, please enter a right userID',
      );
    }
    const participant = this.participantDic.get(userID) as ZegoParticipant;
    participant.renderView = renderView;
    this.participantDic.set(userID, participant);
    if (participant.streamID) {
      // inner roomStreamUpdate -> inner roomUserUpdate -> out roomUserUpdate
      this.streamDic.set(participant.streamID, participant);
    } else {
      // inner roomUserUpdate -> out roomUserUpdate -> inner roomStreamUpdate
    }
    this.playStream(userID);
  }
  /// Leave the room when you are done the talk or if you want to join another room
  leaveRoom(): Promise<void> {
    console.warn(
      '[ZEGOCLOUD LOG][Manager][leaveRoom] - Stop publishing stream',
    );
    console.warn('[ZEGOCLOUD LOG][Manager][leaveRoom] - Stop preview');
    const roomID = this.roomID;
    ZegoExpressEngine.instance().stopPublishingStream();
    ZegoExpressEngine.instance().stopPreview();
    this.participantDic.forEach(participant => {
      ZegoExpressEngine.instance().stopPlayingStream(participant.streamID);
      console.warn(
        '[ZEGOCLOUD LOG][Manager][leaveRoom] - Stop playing stream',
        participant.streamID,
      );
    });
    this.participantDic.clear();
    this.streamDic.clear();
    this.roomID = '';
    // @ts-ignore
    this.localParticipant = {};
    this.deviceUpdateCallback.length = 0;
    this.mediaOptions = [
      ZegoMediaOptions.AutoPlayAudio,
      ZegoMediaOptions.AutoPlayVideo,
      ZegoMediaOptions.PublishLocalAudio,
      ZegoMediaOptions.PublishLocalVideo,
    ];

    return ZegoExpressEngine.instance()
      .logoutRoom(roomID)
      .then(() => {
        console.warn('[ZEGOCLOUD LOG][Manager][logoutRoom] - Logout success');
      });
  }

  /// Set a new token to keep access ZEGOCLOUD's SDK while onRoomTokenWillExpire has been triggered
  renewToken(roomID: string, token: string): Promise<void> {
    return ZegoExpressEngine.instance().renewToken(roomID, token).then(() => {
      console.warn('ZEGO RN LOG - renewToken success');
    });
  }
  /// When you join in the room it will let you know who is in the room right now with [userIDList] and will let you know who is joining the room or who is leaving after you have joined
  onRoomUserUpdate(
    fun: (
      updateType: ZegoUpdateType,
      userList: string[],
      roomID: string,
    ) => void,
  ) {
    return ZegoExpressEngine.instance().on(
      'roomUserUpdate',
      (roomID: string, updateType: ZegoUpdateType, userList: ZegoUser[]) => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][onRoomUserUpdate]',
          roomID,
          updateType,
          userList,
        );
        const userIDList: string[] = [];
        userList.forEach((user: ZegoUser) => {
          userIDList.push(user.userID);
        });
        fun(updateType, userIDList, roomID);
      },
    );
  }
  /// Trigger when device's status of user with [userID] has been update
  onRoomUserDeviceUpdate(
    fun: (
      updateType: ZegoDeviceUpdateType,
      userID: string,
      roomID: string,
    ) => void,
  ) {
    this.deviceUpdateCallback.push(fun);
  }
  /// Trigger when the access token will expire which mean you should call renewToken to set new token
  onRoomTokenWillExpire(
    fun: (roomID: string, remainTimeInSecond: number) => void,
  ) {
    return ZegoExpressEngine.instance().on('roomTokenWillExpire', fun);
  }
  onRoomStateUpdate(fun: (state: ZegoRoomState) => void) {
    return ZegoExpressEngine.instance().on(
      'roomStateUpdate',
      (roomID: string, state: ZegoRoomState) => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][onRoomStateUpdate]',
          roomID,
          state,
        );
        fun(state);
      },
    );
  }
  private generateStreamID(userID: string, roomID: string): string {
    if (!userID) {
      console.error(
        '[ZEGOCLOUD LOG][Manager][generateStreamID] - UserID is empty, please enter a right userID',
      );
    }
    if (!roomID) {
      console.error(
        '[ZEGOCLOUD LOG][Manager][generateStreamID] - RoomID is empty, please enter a right roomID',
      );
    }

    // The streamID can use any character.
    // For the convenience of query, roomID + UserID + suffix is used here.
    const streamID = roomID + userID + '_main';
    return streamID;
  }
  private onOtherEvent() {
    ZegoExpressEngine.instance().on(
      'roomUserUpdate',
      (roomID: string, updateType: ZegoUpdateType, userList: ZegoUser[]) => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][roomUserUpdate]',
          roomID,
          updateType,
          userList,
        );
        // Register callback, read more about: https://doc-en-api.zego.im/ReactNative/classes/_zegoexpressengine_.zegoexpressengine.html#on
        userList.forEach(user => {
          if (updateType === ZegoUpdateType.Add) {
            const participant = this.participantDic.get(user.userID);
            if (participant) {
              // inner roomStreamUpdate -> inner roomUserUpdate -> out roomUserUpdate
            } else {
              // inner roomUserUpdate -> out roomUserUpdate -> inner roomStreamUpdate
              this.participantDic.set(user.userID, {
                userID: user.userID,
                name: user.userName,
              } as ZegoParticipant);
            }
          } else {
            this.participantDic.delete(user.userID);
          }
        });
      },
    );
    ZegoExpressEngine.instance().on(
      'roomStreamUpdate',
      (
        roomID: string,
        updateType: ZegoUpdateType,
        streamList: ZegoStream[],
      ) => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][roomStreamUpdate]',
          roomID,
          updateType,
          streamList,
        );
        streamList.forEach(stream => {
          const participant = this.participantDic.get(stream.user.userID);
          if (updateType === ZegoUpdateType.Add) {
            const participant_ = {
              userID: stream.user.userID,
              name: stream.user.userName,
              streamID: stream.streamID,
            };
            if (participant) {
              // inner roomUserUpdate -> out roomUserUpdate -> inner roomStreamUpdate
              participant.streamID = stream.streamID;
              this.participantDic.set(stream.user.userID, participant);
              this.streamDic.set(stream.streamID, participant);
            } else {
              // inner roomStreamUpdate -> inner roomUserUpdate -> out roomUserUpdate
              this.participantDic.set(
                stream.user.userID,
                participant_ as ZegoParticipant,
              );
              this.streamDic.set(
                stream.streamID,
                participant_ as ZegoParticipant,
              );
            }
            this.playStream(stream.user.userID);
          } else {
            ZegoExpressEngine.instance().stopPlayingStream(stream.streamID);
            this.streamDic.delete(stream.streamID);
          }
        });
      },
    );
    ZegoExpressEngine.instance().on(
      'publisherQualityUpdate',
      (streamID: string, quality: ZegoPublishStreamQuality) => {
        const participant = this.streamDic.get(streamID);
        if (!participant) {
          return;
        }

        participant.publishQuality = quality.level;

        this.streamDic.set(streamID, participant);
        this.participantDic.set(participant.userID, participant);
      },
    );
    ZegoExpressEngine.instance().on(
      'playerQualityUpdate',
      (streamID: string, quality: ZegoPlayStreamQuality) => {
        const participant = this.streamDic.get(streamID);
        if (!participant) {
          return;
        }

        participant.playQuality = quality.level;

        this.streamDic.set(streamID, participant);
        this.participantDic.set(participant.userID, participant);
      },
    );
    ZegoExpressEngine.instance().on(
      'remoteCameraStateUpdate',
      (streamID: string, state: ZegoRemoteDeviceState) => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][remoteCameraStatusUpdate]',
          streamID,
          state,
        );
        const participant = this.streamDic.get(streamID);
        if (participant) {
          const updateType =
            state === ZegoRemoteDeviceState.Open
              ? ZegoDeviceUpdateType.CameraOpen
              : ZegoDeviceUpdateType.CameraClose;
          participant.camera = state === ZegoRemoteDeviceState.Open;
          this.streamDic.set(streamID, participant);
          this.participantDic.set(participant.userID, participant);
          this.deviceUpdateCallback.forEach(fun => {
            fun(updateType, participant.userID, this.roomID);
          });
        }
      },
    );
    ZegoExpressEngine.instance().on(
      'remoteMicStateUpdate',
      (streamID: string, state: ZegoRemoteDeviceState) => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][remoteMicStatusUpdate]',
          streamID,
          state,
        );
        const participant = this.streamDic.get(streamID);
        if (participant) {
          const updateType =
            state === ZegoRemoteDeviceState.Open
              ? ZegoDeviceUpdateType.MicUnmute
              : ZegoDeviceUpdateType.MicMute;
          participant.mic = state === ZegoRemoteDeviceState.Open;
          this.streamDic.set(streamID, participant);
          this.participantDic.set(participant.userID, participant);
          this.deviceUpdateCallback.forEach(fun => {
            fun(updateType, participant.userID, this.roomID);
          });
        }
      },
    );
    ZegoExpressEngine.instance().on(
      'roomStateUpdate',
      (roomID, state, errorCode) => {
        console.warn(
          '[ZEGOCLOUD LOG][Manager][roomStateUpdate]',
          roomID,
          state,
          errorCode,
        );
      },
    );
  }
  private playStream(userID: string) {
    if (
      this.mediaOptions.includes(ZegoMediaOptions.AutoPlayAudio) ||
      this.mediaOptions.includes(ZegoMediaOptions.AutoPlayVideo)
    ) {
      const participant = this.participantDic.get(userID);
      if (participant && participant.streamID && participant.renderView) {
        const zegoView = new ZegoView(
          participant.renderView,
          ZegoViewMode.AspectFit,
          0,
        );
        console.warn(
          '[ZEGOCLOUD LOG][Manager][playStream] - Start playing stream',
        );
        ZegoExpressEngine.instance().startPlayingStream(
          participant.streamID,
          zegoView,
        );
        ZegoExpressEngine.instance().mutePlayStreamAudio(
          participant.streamID,
          !this.mediaOptions.includes(ZegoMediaOptions.AutoPlayAudio),
        );
        ZegoExpressEngine.instance().mutePlayStreamVideo(
          participant.streamID,
          !this.mediaOptions.includes(ZegoMediaOptions.AutoPlayVideo),
        );
      }
    }
  }
}
