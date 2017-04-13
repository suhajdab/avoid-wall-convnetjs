// TODO: try http://cs.stanford.edu/people/karpathy/reinforcejs/waterworld.html
// TODO: save network state before battery dies
// TODO: load state

/**
 *  Run script on mBot with: $ node app.js /dev/tty.Makeblock-ELETSPP
 */
var five = require('johnny-five');
var pixel = require('node-pixel');
var LinearScale = require('linear-scale');
var log = require('single-line-log').stdout;
var brain = require('./brain');

// keypress setup
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);


var opts = {};
opts.port = process.argv[2] || "";

var board = new five.Board(opts);

// mBot config
var l_motor, r_motor,		// five.Motor objects
	r_proximitySensor,		// five.Proximity object
	l_motorspeed = 0,		// current left motor speed [0-1]
    r_motorspeed = 0,		// current right motor speed [0-1]
    max_motorspeed = 160,	// max motor speed [0-255]
    safe_distance = 0.2,	// 20 cm
    l_proximity = 0,		// reading from left sensor
	hitWall = false,		// proximity to obstacle under safe distance
	proximityFreq = 50, 	// reading update frequency
	scaleMovementReward = LinearScale().domain([-2, 2]).range([0, 0.5]); // scaling motors speed for reward


function constrain(n, min, max) {
    if (n > max) return max;
    if (n < min) return min;
    return n;
}

function roundToDecimal(n) {
    return Math.round(n * 100) / 100;
}


function onKeypress(str, key) {
    if (key.ctrl && key.name === 'c') {
		// lets stop the motors before exit
		r_proximitySensor.removeListener("data", onProximityData);
		setMotors(0, 0);
		setTimeout(process.exit, 10);
    } else if (key.name == 's') {
        var json = brain.value_net.toJSON();
        var str = JSON.stringify(json);
        console.log('network parameters');
        console.log(str);
        console.log('')
    }
}

function setMotors(l_motorspeed, r_motorspeed) {
	if (l_motorspeed > 0) l_motor.reverse(l_motorspeed * max_motorspeed);
	else l_motor.forward(-l_motorspeed * max_motorspeed);
	if (r_motorspeed > 0) r_motor.forward(r_motorspeed * max_motorspeed);
	else r_motor.reverse(-r_motorspeed * max_motorspeed);
}


function onBoardReady() {

	    /**
	     * Motors
	     */
	    l_motor = new five.Motor({
	        pins: {
	            pwm: 6,
	            dir: 7
	        }
	    });
	    r_motor = new five.Motor({
	        pins: {
	            pwm: 5,
	            dir: 4
	        }
	    });


	    /**
	     * Sonar
	     */
	    r_proximitySensor = new five.Proximity({
	        freq: proximityFreq,
	        controller: "HCSR04",
	        pin: 10 // port 2
	    });

	    var l_proximitySensor = new five.Proximity({
	        freq: proximityFreq,
	        controller: "HCSR04",
	        pin: 12 // port 2
	    });

	    l_proximitySensor.on("data", function() {
	        l_proximity = roundToDecimal(this.cm / 100);
	    });

	    r_proximitySensor.on("data", onProximityData);
}

function onProximityData() {
	var fullsteam_reward = 0,
		movement_reward = 0,
		proximity_penalty = 0,
		proximity_reward = 0,
		reward = 0;
	var r_proximity = roundToDecimal(this.cm / 100);
	var forward = [r_proximity, l_proximity, l_motorspeed, r_motorspeed];
	var action = brain.forward(forward);

	// calculate reward
	// proximity_reward = (r_proximity > safe_distance && l_proximity > safe_distance) ? 0.5 : 0;
	// punish hiting wall
	if (!hitWall && (r_proximity < safe_distance || l_proximity < safe_distance)) {
		hitWall = true;
		proximity_penalty = -4;
	} else if (r_proximity > safe_distance && l_proximity > safe_distance) {
		hitWall = false;
	}
	// celebrate clear path and full steam ahead
	if (r_proximity > safe_distance && l_proximity > safe_distance && l_motorspeed + r_motorspeed > 0) {
		fullsteam_reward = 1;
	}

	// movement_reward = scaleMovementReward(l_motorspeed + r_motorspeed);
	var reward = proximity_penalty + proximity_reward + fullsteam_reward + movement_reward;

	brain.backward(reward);

	log('action: ' + action + '\nforward: ' + forward.join('\t') + '\nreward: ' + reward + '\nreport: ' + brain.report().join('\n') + '\n');

	switch (action) {
		case 0:
			l_motorspeed += .5;
			break;
		case 1:
			l_motorspeed -= .5;
			break;
		case 2:
			r_motorspeed += .5;
			break;
		case 3:
			r_motorspeed -= .5;
			break;
	}

	// emergency stop before hitting the wall
	if ((r_proximity <= 0.05 || l_proximity <= 0.05) && (l_motorspeed > 0 || r_motorspeed > 0)) {
		l_motorspeed = 0;
		r_motorspeed = 0;
	}

	l_motorspeed = constrain(l_motorspeed, -1, 1);
	r_motorspeed = constrain(r_motorspeed, -1, 1);

	setMotors(l_motorspeed, r_motorspeed);
}


// Let's get this party started
process.stdin.on('keypress', onKeypress);
board.on("ready", onBoardReady);
