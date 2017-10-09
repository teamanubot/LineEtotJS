const LineAPI = require('./api');
const { Message, OpType, Location } = require('../curve-thrift/line_types');
let exec = require('child_process').exec;

const myBot = ['ub4974c6489c969402713a974b568ee9e','u08c98f75e8656a37597a71e07b03d781','uacf8824fa827c271a48a2fa4c337266c','ue6ab7d65e34868a3e2cc2d655eedf25b'];


function isAdminOrBot(param) {
    return myBot.includes(param);
}


class LINE extends LineAPI {
    constructor() {
        super();
        this.receiverID = '';
        this.checkReader = [];
        this.stateStatus = {
            cancel: 0,
            kick: 0,
        }
    }

    getOprationType(operations) {
        for (let key in OpType) {
            if(operations.type == OpType[key]) {
                if(key !== 'NOTIFIED_UPDATE_PROFILE') {
                    console.info(`[* ${operations.type} ] ${key} `);
                }
            }
        }
    }

    poll(operation) {
        if(operation.type == 25 || operation.type == 26) {
            // console.log(operation);
            const txt = (operation.message.text !== '' && operation.message.text != null ) ? operation.message.text : '' ;
            let message = new Message(operation.message);
            this.receiverID = message.to = (operation.message.to === myBot[0]) ? operation.message.from_ : operation.message.to ;
            Object.assign(message,{ ct: operation.createdTime.toString() });
            this.textMessage(txt,message)
        }

        if(operation.type == 13 && this.stateStatus.cancel == 1) {
            this.cancelAll(operation.param1);
        }

           if(operation.type == 11) { //ada update
           // op1 = group nya
           // op2 = yang 'nge' update
           if(!isAdminOrBot(operation.param2)) {
              this._kickMember(operation.param1,[operation.param2]);
             }

           }

           if(operation.type == 19) { //ada kick
            // op1 = group nya
            // op2 = yang 'nge' kick
            // op3 = yang 'di' kick
            if(isAdminOrBot(operation.param3)) {
               this._inviteMember(operation.param1,[operation.param3]);
            }
            if(!isAdminOrBot(operation.param2)) {
               this._kickMember(operation.param1,[operation.param2]);
            } 

        }

        if(operation.type == 48) {
             this._client.removeAllMessages( );
        }

        if(operation.type == 55){ //ada reader

            const idx = this.checkReader.findIndex((v) => {
                if(v.group == operation.param1) {
                    return v
                }
            })
            if(this.checkReader.length < 1 || idx == -1) {
                this.checkReader.push({ group: operation.param1, users: [operation.param2], timeSeen: [operation.param3] });
            } else {
                for (var i = 0; i < this.checkReader.length; i++) {
                    if(this.checkReader[i].group == operation.param1) {
                        if(!this.checkReader[i].users.includes(operation.param2)) {
                            this.checkReader[i].users.push(operation.param2);
                            this.checkReader[i].timeSeen.push(operation.param3);
                        }
                    }
                }
            }
        }

        if(operation.type == 13) { // diinvite
            if(isAdminOrBot(operation.param2)) {
                return this._acceptGroupInvitation(operation.param1);
            } else {
                return this._cancel(operation.param1,myBot);
            }
        }
        this.getOprationType(operation);
    }

    async cancelAll(gid) {
        let { listPendingInvite } = await this.searchGroup(gid);
        if(listPendingInvite.length > 0){
            this._cancel(gid,listPendingInvite);
        }
    }

    async searchGroup(gid) {
        let listPendingInvite = [];
        let thisgroup = await this._getGroups([gid]);
        if(thisgroup[0].invitee !== null) {
            listPendingInvite = thisgroup[0].invitee.map((key) => {
                return key.mid;
            });
        }
        let listMember = thisgroup[0].members.map((key) => {
            return { mid: key.mid, dn: key.displayName };
        });

        return { 
            listMember,
            listPendingInvite
        }
    }

    setState(seq) {
        if(isAdminOrBot(seq.from)){
            let [ actions , status ] = seq.text.split(' ');
            const action = actions.toLowerCase();
            const state = status.toLowerCase() == 'on' ? 1 : 0;
            this.stateStatus[action] = state;
            this._sendMessage(seq,`Status: \n${JSON.stringify(this.stateStatus)}`);
        } else {
            this._sendMessage(seq,`Mohon Maaf Anda Bukan Admin~`);
        }
    }

    mention(listMember) {
        let mentionStrings = [''];
        let mid = [''];
        for (var i = 0; i < listMember.length; i++) {
            mentionStrings.push('@'+listMember[i].displayName+'\n');
            mid.push(listMember[i].mid);
        }
        let strings = mentionStrings.join('');
        let member = strings.split('@').slice(1);
        
        let tmp = 0;
        let memberStart = [];
        let mentionMember = member.map((v,k) => {
            let z = tmp += v.length + 1;
            let end = z - 1;
            memberStart.push(end);
            let mentionz = `{"S":"${(isNaN(memberStart[k - 1] + 1) ? 0 : memberStart[k - 1] + 1 ) }","E":"${end}","M":"${mid[k + 1]}"}`;
            return mentionz;
        })
        return {
            names: mentionStrings.slice(1),
            cmddata: { MENTION: `{"MENTIONEES":[${mentionMember}]}` }
        }
    }

    async leftGroupByName(payload) {
        let gid = await this._findGroupByName(payload);
        for (var i = 0; i < gid.length; i++) {
            this._leaveGroup(gid[i]);
        }
    }
    
    async recheck(cs,group) {
        let users;
        for (var i = 0; i < cs.length; i++) {
            if(cs[i].group == group) {
                users = cs[i].users;
            }
        }
        
        let contactMember = await this._getContacts(users);
        return contactMember.map((z) => {
                return { displayName: z.displayName, mid: z.mid };
            });
    }

    removeReaderByGroup(groupID) {
        const groupIndex = this.checkReader.findIndex(v => {
            if(v.group == groupID) {
                return v
            }
        })

        if(groupIndex != -1) {
            this.checkReader.splice(groupIndex,1);
        }
    }

    async textMessage(textMessages, seq) {
        let [ cmd, ...payload ] = textMessages.split(' ');
        payload = payload.join(' ');
        let txt = textMessages.toLowerCase();
        let messageID = seq.id;

        var protect_qr = await this._getGroup(seq.to);

        if(cmd == 'cancel') {
            if(payload == 'group') {
                let groupid = await this._getGroupsInvited();
                for (let i = 0; i < groupid.length; i++) {
                    this._rejectGroupInvitation(groupid[i])                    
                }
                return;
            }
            if(this.stateStatus.cancel == 1) {
                this.cancelAll(seq.to);
            }
        }

        if(txt == 'respon' && isAdminOrBot(seq.from)) {
            this._sendMessage(seq, 'Bot Telah Siap~');
       }

        if(txt == 'admin') {
            this._sendMessage(seq, 'This Is My Admin :\n\n(1.) Jeck\nId Line : http://line.me/ti/p/~muhrafly22\n(2.) Negan\nId Line : http://line.me/ti/p/~pasukan_bangsat\n\n-TeamSemvakBot-');
        }

        if(txt == 'halo') {
          if(isAdminOrBot(seq.from)) {
        this._sendMessage(seq, 'Halo Juga Admin TSB');
        }
      else
        {
         this._sendMessage(seq, 'Bubar Bubar Ada Anak Kebanyakan Micin~');
         }
     }

        if(txt == 'test speed') {
            const curTime = (Date.now() / 1000);
            await this._sendMessage(seq,'Tunggu Hentai....');
            const rtime = (Date.now() / 1000) - curTime;
            await this._sendMessage(seq, `${rtime} second`);
        }

        if(txt == 'tag') {
let { listMember } = await this.searchGroup(seq.to);
     const mentions = await this.mention(listMember);
        seq.contentMetadata = mentions.cmddata; await this._sendMessage(seq,mentions.names.join(''))
        }

        if(txt === 'kernelo') {
            exec('uname -a;ptime;id;whoami',(err, sto) => {
                this._sendMessage(seq, sto);
            })
        }

        if(txt === 'kickall' && this.stateStatus.kick == 1 && isAdminOrBot(seq.from)) {
            let { listMember } = await this.searchGroup(seq.to);
            for (var i = 0; i < listMember.length; i++) {
                if(!isAdminOrBot(listMember[i].mid)){
                    this._kickMember(seq.to,[listMember[i].mid])
                }
            }
        }

        if(txt == 'baca read') {
            this._sendMessage(seq, `Pembacaan Read Dimulai Dari Sekarang.`);
            this.removeReaderByGroup(seq.to);
        }

        if(txt == 'hapus pembacaan read') {
            this.checkReader = []
            this._sendMessage(seq, `Menghapus Data Pembacaan Read`);
        }  

        if(txt == 'lihat pembacaan read'){
            let rec = await this.recheck(this.checkReader,seq.to);
            const mentions = await this.mention(rec);
            seq.contentMetadata = mentions.cmddata;
            await this._sendMessage(seq,mentions.names.join(''));
            }

        if(txt == 'creator') {
           let txt = await this._sendMessage(seq, 'This Is My Creator :');
           seq.contentType=13;
           seq.contentMetadata = { mid: 'ub4974c6489c969402713a974b568ee9e' };
           this._client.sendMessage(0, seq);
        }

        //if(seq.contentType == 13) {
            //seq.contentType = 0
            //this._sendMessage(seq,seq.contentMetadata.mid);
        //}

        if(txt == 'setpoint for check reader .') {
            this.searchReader(seq);
        }

        if(txt == 'clearall') {
            this.checkReader = [];
        }

        const action = ['cancel on','cancel off','kick on','kick off']
        if(action.includes(txt)) {
            this.setState(seq)
        }
	
        if(txt == 'myid') {
            this._sendMessage(seq,`MID Anda : ${seq.from}`);
        }

        const joinByUrl = ['open url','close url'];
        if(joinByUrl.includes(txt) && isAdminOrBot(seq.from)) {
            this._sendMessage(seq,`Tunggu Sebentar ...`);
            let updateGroup = await this._getGroup(seq.to);
            updateGroup.preventJoinByTicket = true;
            if(txt == 'open url') {
                updateGroup.preventJoinByTicket = false;
                const groupUrl = await this._reissueGroupTicket(seq.to)
                this._sendMessage(seq,`Line group = line://ti/g/${groupUrl}`);
            }
            await this._updateGroup(updateGroup);
        }

        if(cmd == 'join') { //untuk join group pake qrcode contoh: join line://anu/g/anu
            const [ ticketId ] = payload.split('g/').splice(-1);
            let { id } = await this._findGroupByTicket(ticketId);
            await this._acceptGroupInvitationByTicket(id,ticketId);
        }

        if(cmd == 'Nk' && isAdminOrBot(seq.from)){
           let target = payload.replace('@',' ');
           let group = await this._getGroups([seq.to]);
           let gm = group[0].members;
              for(var i = 0; i < gm.length; i++){
                     if(gm[i].displayName == target){
                                  target = gm[i].mid;
                     }
               }
               this._kickMember(seq.to,[target]);
        }

        if(cmd == 'spam' && isAdminOrBot(seq.from)) {
            for(var i= 0; i < 100;  i++) {
               this._sendMessage(seq, 'I Love Hentai~');
        }
    }

        if(cmd == 'spm' && isAdminOrBot(seq.from)) { // untuk spam invite contoh: spm <mid>
            for (var i = 0; i < 100; i++) {
                this._createGroup(`FUCK YOU`,payload);
            }
        }
        
        if(txt == 'tsb bye' && isAdminOrBot(seq.from)) {
          let txt = await this._sendMessage(seq, 'Kami Dari TeamSemvakBot (TSB) Terima Kasih Atas Groupnya Dan Kami Izin Leave~');
          this._leaveGroup(seq.to);
        }

        if(cmd == 'lirik') {
            let lyrics = await this._searchLyrics(payload);
            this._sendMessage(seq,lyrics);
        }

        if(cmd === '') {
            exec(`curl ipinfo.io/${payload}`,(err, res) => {
                const result = JSON.parse(res);
                if(typeof result.error == 'undefined') {
                    const { org, country, loc, city, region } = result;
                    try {
                        const [latitude, longitude ] = loc.split(',');
                        let location = new Location();
                        Object.assign(location,{ 
                            title: `Location:`,
                            address: `${org} ${city} [ ${region} ]\n${payload}`,
                            latitude: latitude,
                            longitude: longitude,
                            phone: null 
                        })
                        const Obj = { 
                            text: 'Location',
                            location : location,
                            contentType: 0,
                        }
                        Object.assign(seq,Obj)
                        this._sendMessage(seq,'Location');
                    } catch (err) {
                        this._sendMessage(seq,'Not Found');
                    }
                } else {
                    this._sendMessage(seq,'Location Not Found , Maybe di dalem goa');
                }
            })
        }
    }

}

module.exports = new LINE();
