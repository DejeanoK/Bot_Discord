const Discord = require('discord.js');
const config = require("./config.json");
const fs = require('fs');
const axios = require('axios');

const myIntents = new Discord.Intents();
myIntents.add(Discord.Intents.FLAGS.GUILDS, Discord.Intents.FLAGS.GUILD_MEMBERS, Discord.Intents.FLAGS.GUILD_BANS, Discord.Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS, Discord.Intents.FLAGS.GUILD_MESSAGES, Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Discord.Intents.FLAGS.GUILD_MESSAGE_TYPING);

const bot = new Discord.Client({intents: myIntents});
const prefix ="$";
const api_key = config.API_KEY;

var targets;
var speaking_channel = null;
var interval;

function read_targets(){
	fs.readFile('targets.json',  (err, data) => {
		if(err){
			console.log("Erreur dans la lecture du fichier");
			throw err;
		}
		targets = JSON.parse(data);
	});
}
function exist(name, lol_name){
	for(let key of targets["targets"]){
		if(key["name"] === name || key["lol_name"] === lol_name){
			return true;
		}
	}
	return false;
}
function saveJson(){
	let tjson = JSON.stringify(targets);
	fs.writeFileSync("targets.json",tjson,"utf-8");
}
function createTarget(target, message){
	axios.get("https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-name/" + encodeURI(target.lol_name) + "?api_key=" + api_key)
		.then( function (response) {
			message.channel.send("Joueur trouvé ! ajout à la liste...");
			target.puuid = response.data["puuid"];
			axios.get("https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/" + target.puuid +  "/ids?start=0&count=1&api_key=" + api_key)
				.then( function (response) {
					target.lastmatch = response.data[0]
					axios.get("https://europe.api.riotgames.com/lol/match/v5/matches/"+ response.data[0] + "?api_key=" + api_key)
					.then(function (response){
						let pos = response.data["metadata"].participants.indexOf(target.puuid);
						target.win = response.data["info"].participants[pos].win;
						target.streak = 1
						targets["targets"].push(target);
						saveJson();
						message.channel.send("Le compte [" + target.lol_name + "] de " + target.name + " a été ajouté.");
					})
					.catch(function (error){
						message.channel.send("Impossible de trouver le résultat du dernier match de ce joueur.");
						console.log(error);
					});
					
				})
				.catch(function (error){
					message.channel.send("Impossible de trouver le dernier match de ce joueur");
					console.log(error);
				});
		})
		.catch(function (error) {
			message.channel.send("Le joueur \"" + target.lol_name + "\" n'existe pas." );
			console.log(error);
		});
}

function newtarget(args){
	let target = {
		"name": "",
		"lol_name": "",	
		"puuid": "",
		"lastmatch": "",
		"win": false,
		"streak": 0,
	};
	target.name = args[0];
	for(let i = 1; i < args.length-1; ++i){
		target.lol_name += args[i]
		target.lol_name += " ";
	}
	target.lol_name += args[args.length-1]; 
	return target
}

function tracking(){
	read_targets();
	console.log("tracking...")
	for(let player in targets["targets"]){
		let t = targets["targets"][player];
		axios.get("https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/" + t.puuid +  "/ids?start=0&count=1&api_key=" + api_key)
			.then( function (response) {
				if(t.lastmatch != response.data[0]){
					targets["targets"][player].lastmatch = response.data[0];
					axios.get("https://europe.api.riotgames.com/lol/match/v5/matches/"+ response.data[0] + "?api_key=" + api_key)
					.then(function (response2){
						let pos = response2.data["metadata"].participants.indexOf(t.puuid);
						if(t.win == response2.data["info"].participants[pos].win){
							targets["targets"][player].streak += 1;
						}
						else {
							targets["targets"][player].streak = 1;
							targets["targets"][player].win = !t.win;
							t.win = !t.win;
						}
						let kills = response2.data["info"].participants[pos].kills;
						let deaths = response2.data["info"].participants[pos].deaths;
						let assists = response2.data["info"].participants[pos].assists;
						speaking_channel.send(t.name + " viens de " + (t.win ? "gagner" : "perdre") + " une game. Il a fini avec un KDA de " + kills + "/" + deaths + "/"+ assists +". Il est en chain"+ (t.win ? "win" : "loose") +" de "+targets["targets"][player].streak + ".");
						saveJson();
					})
					.catch(function (error){
						speaking_channel.send("Impossible de trouver le résultat du dernier match de ce joueur.");
						console.log(error);
					});
				}
				
			})
			.catch(function (error) {
				speaking_channel.send("Erreur lors de l'actualisation du joueur " + t.name);
				console.log(error);
			})
	}
}

read_targets();
bot.login(config.BOT_TOKEN);
bot.on("messageCreate", async message => {
	if (message.author.bot) return; //si msg de bot osef
	if (!message.content.startsWith(prefix)) return; //si msg commence pas par prefix osef
	const commandBody = message.content.slice(prefix.length); //suppr le prefix
	const args = commandBody.split(' '); //suppr les espaces et fait un tableau
	const command = args.shift().toLowerCase(); //rend insensible a la case
  
	switch (command){
		case "help":
			message.channel.send("Commande disponible : help, ping, list, start, stop, setchannel, infos");
		break;
		
		case "ping":
			const timeTaken = message.createdTimestamp-Date.now();
			message.reply(`ping : ${timeTaken}ms.`);
			message.react('🏓');
		break;
		case "addtarget":
			let target = newtarget(args);
			if(!exist(target.name, target.lol_name)){
				createTarget(target, message);
				read_targets();
			}
			else{
				message.channel.send("Joueur déjà existant.");
			}
		break;
		
		case "list":
			let temp = "Liste des cibles : \n";
				for(let key of targets["targets"]){
					temp += key.name + " - " + key.lol_name + "\n"
				}
			message.channel.send(temp);
		break;
		case "deltarget":
			if(exist(args[0], args[0])){
				for(let t in targets["targets"]){
					if(targets["targets"][t].name === args[0]){
						targets["targets"].splice(t, 1);
						saveJson();
						message.channel.send("Joueur retiré.");
					}
				}
				read_targets();
			}
			else {
				message.channel.send("Le joueur " + args[0] + " n'existe pas");
			}
		break;
		
		case "setchannel":
			speaking_channel = message.channel;
			message.channel.send("Ce channel est désormais mon salon par défaut.");
		break;
		
		case "track":
			read_targets();
			tracking();
			message.channel.send("tracking...");
		break;
		case "start":
			if(speaking_channel == null){
				message.channel.send("Veuillez définir un channel grâce à [$setchannel]");
				break;
			}
			interval = setInterval(tracking, 300000);
			message.channel.send("Le tracking commence")
		break;
		case "stop":
			clearInterval(interval);
		break;
		case "infos":
		read_targets();
			for(let player of targets["targets"]){
				message.channel.send(player.name + " [" + player.lol_name + "] est en streak de " + player.streak + " " + (player.win ? "win" : "loose") + " 🔥");
			}
		break;
	}
});






	
