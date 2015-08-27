(function() {
	/*
	 * Track "class"
	 */
	var context = null;
	var isMuted = false;
	var metroVol = 1;
	var isPlaying = false;      // Are we currently playing?
	var startTime;              // The start time of the entire sequence.
	var current16thNote;        // What note is currently last scheduled?
	var tempo1 = 120.0;          // tempo (in beats per minute)
	var lookahead = 5.0;       // How frequently to call scheduling function 
	var beatPos = 1;                           //(in milliseconds)
	var scheduleAheadTime = 0;    // How far ahead to schedule audio (sec)
								// This is calculated from lookahead, and overlaps 
								// with next interval (in case the timer is late)
	var nextNoteTime = 0.0;     // when the next note is due.
	var noteResolution = 2;     // 0 == 16th, 1 == 8th, 2 == quarter note
	var noteLength = 0.05;      // length of "beep" (in seconds)
	var canvas,                 // the canvas element
		canvasContext;          // canvasContext is the canvas' context 2D
	var last16thNoteDrawn = -1; // the last "box" we drew on the screen
	var notesInQueue = [];      // the notes that have been put into the web audio,
								// and may or may not have played yet. {note, time}
	var timerWorker = null;     // The Web Worker used to fire timer messages
	
	var name = "";
	
	var STATE_EMPTY = 		"empty";
	var STATE_COUNT = 		"count";
	var STATE_REC = 		"rec";
	var STATE_PLAY = 		"play";
	var STATE_STOPPED =	"stopped";
	 
	var monitor;
	var output;
		 

	var Track = function() {
		var bpm;
		var state;
		var beat;
		var countdown;

		var source;
		var buffer;
		var imported = false;

		// DOM elements
		var view;
		var buttonRec;
		var buttonPlay;
		var buttonStop;
		var buttonDelete;
		var counts;
		var countsEl;
		var rec;
		var recEnd;
		var trackHead;
		var volume;
		var effectWrapper;
		var effect;
		var effectSlider;
		var beats;
		var value;
		var recorder;
		var effectType;


		var stopTrack = false;
		var trackVol;
		var effectVal = 50;
		var self;
			
			

		//media stream for microphone   
			
				

				

		function init(view,bpm, mediaStreamSource) {
			
			this.source = context.createBufferSource();

			this.recorder = new Recorder(mediaStreamSource, {
				workerPath: "./js/lib/recorderjs/recorderWorker.js"
			});
				
			this.view = view;

			this.state = STATE_EMPTY;

			this.buttonRec = this.view.getElementsByClassName("track-rec-button")[0];
			this.buttonPlay = this.view.getElementsByClassName("track-play-button")[0];
			this.buttonStop = this.view.getElementsByClassName("track-stop-button")[0];
			this.buttonDelete = this.view.getElementsByClassName("track-delete-button")[0];

			self = this; // pass context to event callbacks
		
			this.buttonRec.addEventListener('click', eventRecord);
			this.buttonPlay.addEventListener('click', eventPlay);
			this.buttonStop.addEventListener('click', eventStop);
			this.buttonDelete.addEventListener('click', eventDelete);

			this.countsEl = this.view.getElementsByClassName("track-count")[0];

			// When recording ends, start looping
			this.rec = this.view.getElementsByClassName("track-svg-rec-bg")[0];
			this.recEnd = this.view.getElementsByClassName("track-svg-rec-bg-end")[0];
			this.rec.addEventListener('animationend', function() {
				changeState(STATE_PLAY);
			});

			this.trackHead = this.view.getElementsByClassName("track-svg-play")[0];

			this.volume = this.view.getElementsByClassName('track-volume')[0];
			this.volume.addEventListener('change', changeVolume);

			this.effect = this.view.getElementsByClassName('track-effect')[0];
			this.effect.addEventListener('change', changeEffect);
			
			this.effectWrapper = this.view.getElementsByClassName('track-effect-wrapper')[0];

			this.effectSlider = this.view.getElementsByClassName('track-effect-slider')[0];
			this.effectSlider.addEventListener('change', changeEffectSlider);

			this.beats = this.view.getElementsByClassName("track-svg-beat");
			for(var i = 0, j = this.beats.length; i < j; i++) {
				this.beats[i].addEventListener('animationend', function(e) {
					this.classList.remove("pulse");
				});
			}
			this.setBPM(tempo);
			this.countdown = -1;
			this.count = 0;
			this.beat = -1;
		}
		
		function playTrack(){
			self.recorder.stop();
			if(self.source.isPlaying) self.source.stop();			
			try { 
				self.source = context.createBufferSource();
				if(!imported) {
					self.recorder.getBuffer(function (buffers) {
						self.source.buffer = context.createBuffer(1, buffers[0].length, 44100);
						self.source.buffer.getChannelData(0).set(buffers[0]);
						self.source.buffer.getChannelData(0).set(buffers[1]);
						self.buffer = self.source.buffer;
						self.source.start(0);
						//source.connect(output);
						checkEffect();
					});	
					imported = true;
				} else {
					self.source.buffer = self.buffer;
					self.source.start(0);
					checkEffect();
				}
			} catch(e) {
				// This is only here because I've seen too many errors... :(
			}
		
		}
		
		function getSample(url, cb) {
			var request = new XMLHttpRequest()
			request.open('GET', url)
			request.responseType = 'arraybuffer'
			request.onload = function() {
			context.decodeAudioData(request.response, cb)
			}
			request.send()
		}
		
		function generateCurve(steps){
			var curve = new Float32Array(steps)
			var deg = Math.PI / 180

			for (var i=0;i<steps;i++) {
			var x = i * 2 / steps - 1
			curve[i] = (3 + 10) * x * 20 * deg / (Math.PI + 10 * Math.abs(x))
			}

			return curve
		}
		

		function changeState(state) {
			clearStates();

			switch(state) {
				case(STATE_COUNT):
					// Reset all animations
					resetAnimation(self.rec);
					resetAnimation(self.recEnd);
					startCountdown();
					break;

				case(STATE_REC):
					self.view.classList.add(STATE_REC);
					self.setBPM(tempo1);
					// Code to record
					self.recorder.clear();
					self.recorder.record();
					imported = false;
					break;

				case(STATE_PLAY):
					stopTrack = false;
					self.view.classList.add(STATE_PLAY);
			
					// Code to play
					break;

				case(STATE_STOPPED):
					stopTrack = true;
					self.recorder.stop();
					self.view.classList.add(STATE_PLAY);
					self.view.classList.add(STATE_STOPPED);
					for(var i = 0, j = self.beats.length; i < j; i++) {
						self.beats[i].classList.remove('pulse');
					}
					// Code to stop
					self.source.stop();
					break;

				case(STATE_EMPTY):
					self.view.classList.add(STATE_EMPTY);
					// Code to delete current track
					self.source.stop();
					self.buffer = null;
					imported = false;
					self.recorder.clear();
					break;

			}

			self.state = state;
		}

		function clearStates() {
			self.view.classList.remove(STATE_EMPTY);
			self.view.classList.remove(STATE_COUNT);
			self.view.classList.remove(STATE_REC);
			self.view.classList.remove(STATE_PLAY);
			self.view.classList.remove(STATE_STOPPED);
		}

		function eventRecord(e) {  
			e.preventDefault();
			if(isPlaying) {
				changeState(STATE_COUNT);
			}
		}

		function eventPlay(e) {
			e.preventDefault();
			if(isPlaying) {
				stopTrack = false;
				//playTrack();
				changeState(STATE_PLAY);
			}
		}

		function eventStop(e) {
			stopTrack = true;
			e.preventDefault();
			changeState(STATE_STOPPED);
		}

		function eventDelete(e) {
			e.preventDefault();
			changeState(STATE_EMPTY);
		}

		function changeEffect(e) {
			if(self.effect.selectedIndex == 0)
				self.effectWrapper.classList.remove('selected');
			else
				self.effectWrapper.classList.add('selected');

			effectType = self.effect.options[self.effect.selectedIndex].value;
			// Change effect
		   
			checkEffect();
		}

		function changeEffectSlider(e) {
			console.log(self.effectSlider.value);
			effectVal = self.effectSlider.value;
			checkEffect();	
		}

		
		function checkEffect(){
			trackVol = context.createGain();
			trackVol.gain.value = self.volume.value/100.0;
			console.log(value);
			if(effectType == 'Delay'){
				console.log("delay");
				var delay = context.createDelay();
				var feedback = context.createGain();
				feedback.gain.value = 0.6;
				var filter = context.createBiquadFilter();
				filter.frequency.value = 800;
				console.log(effectVal/100.0);
				delay.delayTime.value = effectVal/100.0; 
				delay.connect(feedback);
				feedback.connect(filter);
				filter.connect(delay);

				self.source.connect(delay);

				delay.connect(trackVol);
				self.source.connect(trackVol);
				trackVol.connect(output);
			}
			else if(effectType == 'Reverb'){
				
				var convolver = context.createConvolver();
				var revGain = context.createGain();
			
				// Add reverb logic here 
				self.source.connect(trackVol);
				self.source.connect(convolver);
				convolver.connect(revGain);
				revGain.gain.value = effectVal/50.0;
				revGain.connect(trackVol);
				trackVol.connect(output);
				getSample('http://thingsinjars.com/lab/web-audio-tutorial/Church-Schellingwoude.mp3', function(impulse){
					convolver.buffer = impulse;
				});


				}
			else if(effectType == 'Distortion'){
				console.log("SI")
				var waveShaper = context.createWaveShaper();
				waveShaper.curve = generateCurve(22050);
				var amp = context.createGain();
				amp.gain.value = effectVal;
				amp.connect(waveShaper);
				self.source.connect(amp);
				waveShaper.connect(trackVol);
				trackVol.connect(output);
			} else {
				self.source.connect(trackVol);
				trackVol.connect(output);
			}		
		}

		function changeVolume(e) {
			trackVol.gain.value = self.volume.value/100.0;
			//console.log(self.volume.value);
		}

		function resetAnimation(element) {
			var duration = element.style.animationDuration;
			//var delay = element.style.animationDelay;
			element.style.webkitAnimation = 'none';
			setTimeout(function() {
				element.style.webkitAnimation = '';
				element.style.animationDuration = duration;
				element.style.animationDelay = -(current16thNote/16.0)*(60/tempo1);
			}, 10);
		}

		function resetAllAnimations() {
			elements = [self.trackHead,self.rec,self.recEnd];
			for (var i = elements.length - 1; i >= 0; i--) {
				resetAnimation(elements[i]);
			};
		}

		function setBPM(bpm) {
			this.bpm = bpm;
			this.trackHead.style.animationDuration = 4*60/this.bpm + "s";
			this.rec.style.animationDuration = 4*60/this.bpm + "s";
			this.recEnd.style.animationDuration = 4*60/this.bpm + "s";
		}

		function registerBeat(beat) {
			self.beat = beat;
			if(self.beat == 0 && stopTrack == false){
				playTrack();
			}
			// Pulse
			self.beats[beat].classList.add("pulse");

			if(self.countdown > 0) {
				self.countsEl.childNodes[self.countsEl.childNodes.length-self.countdown].classList.add('animate');
				self.countdown--;
			} else if(self.countdown == 0) {
				changeState(STATE_REC);
				self.countdown = -1;
			}

			if(beat > 1) return;
		}

		function startCountdown() {

			// Check if the beat has started. If not, then start from 4.
			if(typeof self.beat !== "undefined")
				self.countdown = 4-self.beat-1;
			else
				self.countdown = 4;
			
			// Kill all of the previous countdown numbers
			while(self.countsEl.firstChild)
				self.countsEl.removeChild(self.countsEl.firstChild);

			// If the gap to record is narrow, add extra time
			if(self.countdown < 2)
				self.countdown += 4;

			// Create elements (oh god)
			for(var i = 0; i < self.countdown; i++) {
				var beatElement = document.createElement('span');
				beatElement.classList.add('track-count-no');
				beatElement.innerHTML = self.countdown-i;
				beatElement.style.animationDuration = 60/this.bpm + "s";
				beatElement.style.animationDelay = i*60/this.bpm + "s";
				self.countsEl.appendChild(beatElement);
			}

			// Start countdown
			self.view.classList.add(STATE_COUNT);
		}

		return {
			init: init,
			setBPM: setBPM,
			registerBeat: registerBeat,
			resetAllAnimations: resetAllAnimations,
			stopTrack: stopTrack,
			changeState: changeState,
			state: state,
			source: source
		}
	};
	
	/*
	Main code
	*/


	var metroMute = document.getElementById("metronome");
	
	metroMute.addEventListener('click',function(e){	
		e.preventDefault();
		isMuted = !isMuted;
		if(isMuted){
			metroVol = 0;
			console.log("Mute");
			metroMute.classList.remove('on');
		} else {
			console.log("unMute");
			metroVol = 1;
			metroMute.classList.add('on');
		}
	});
	metroMute.classList.add('on');
	
	var mainPlay = document.getElementById("play");

	mainPlay.addEventListener('click',function(e){
		e.preventDefault();
		//play();	
		console.log("PLAY");
		if(!isPlaying) {
			play();
			mainPlay.classList.add('playing');
		} else {
			mainPlay.classList.remove('playing');
			play();
		}
	});
	
	
	var record = document.getElementById("rec"),
	recording = false;

	record.addEventListener('click',function(e) {    
		e.preventDefault();

		if(!recording) {
			recorderFinal.clear();
			recorderFinal.record();
			record.classList.add('recording');
		} else {
			record.classList.remove('recording');
			$("<p>What is your track called?</p>").prompt(function(e) {
				name = e.response;
			},false);
			recorderFinal.stop();
			recordButtons.classList.add('recorded');
		}

		recording = !recording;
	});
	var recordButtons = document.getElementById("recording-buttons");
	
	// Start tempo
	document.addEventListener("click", function(){
	
	});

	
	
	var download = document.getElementById("download");
	
	download.addEventListener('click', function(){
		//recorderFinal.clear();
		//recorderFinal.record();
		
		createDownloadLink();
		
		console.log("DOWNLOAD");	
	});
	
	
	function createDownloadLink() {
		var bb = recorderFinal && recorderFinal.exportWAV(function(blob) {
		var url = URL.createObjectURL(blob);
		var li = document.createElement('li');
		var au = document.createElement('audio');
		var hf = document.createElement('a');

		au.controls = true;
		au.src = url;
		hf.href = url;
		hf.download = new Date().toISOString() + '.wav';
		if(name != "") hf.download = name + '.wav';
		hf.innerHTML = hf.download;
		li.appendChild(au);
		li.appendChild(hf);
		var click = document.createEvent("Event");
		 click.initEvent("click", true, true);
		 hf.dispatchEvent(click);
		//recordingslist.appendChild(li);

   
		});	
	}
	

	function nextNote() {
		// Advance current note and time by a 16th note...
		var secondsPerBeat = 60.0 / tempo1;    // Notice this picks up the CURRENT 
											  // tempo value to calculate beat length.
		nextNoteTime += 0.25 * secondsPerBeat;    // Add beat length to last beat time

		current16thNote++;    // Advance the beat number, wrap to zero
		if (current16thNote == 16) {
			current16thNote = 0;
			console.log("tick");
			//trigger record if pressed
		}
	}

	function scheduleNote( beatNumber, time ) {
		// push the note on the queue, even if we're not playing.
		notesInQueue.push( { note: beatNumber, time: time } );
	
	
		if ( (beatNumber%4))
			return; // we're not playing non-8th 16th notes
	   
		var osc = context.createOscillator();
		var metroGain = context.createGain();
		osc.connect(metroGain);
		metroGain.gain.value = metroVol;
		metroGain.connect( output );
		if (beatNumber % 16 === 0){    // beat 0 == low pitch
			beat();
			osc.frequency.value = 880.0;
		}
		else if (beatNumber % 4 === 0 ) {   // quarter notes = medium pitch
			osc.frequency.value = 440.0;
			beat();
		}
		else  {                 // other 16th notes = high pitch
			osc.frequency.value = 220.0;
			beat();
		}
		osc.start( time );
		osc.stop( time + noteLength );

	}

	function scheduler() {
		// while there are notes that will need to play before the next interval, 
		// schedule them and advance the pointer.
		//console.log(nextNoteTime);
		while (nextNoteTime < context.currentTime + scheduleAheadTime ) {
			scheduleNote( current16thNote, nextNoteTime );
			nextNote();
		}
	}

	function play() {
		//console.log(isPlaying);
		isPlaying = !isPlaying;
		if (isPlaying) { // start playing
			beatPos = 1;
			current16thNote = 0;
			nextNoteTime = context.currentTime;
			timerWorker.postMessage("start");
			// Reset the animations properly
			for(var i=0;i<tracks.length;i++) {
				try {
					tracks[i].resetAllAnimations();
					tracks[i].registerBeat(0);
				} catch(e) {
					// Nothing, this just makes sure there aren't any problems...
				}
			}
			return "stop";
		} else {
			timerWorker.postMessage("stop");
			// Stop all the other sources
			for(var i=0; i<tracks.length;i++) {
				if(tracks[i].state == STATE_PLAY) {
					tracks[i].stopTrack = true;
					tracks[i].changeState(STATE_STOPPED);
					try {
						tracks[i].source.stop();
					} catch (e) {
						// NOWT
					}
				}
			}
			return "play";
		}
	}
	
	 
	 
	
	
	var tempo = document.getElementById('tempo-slider'),
	tempoLabel = document.getElementById('tempo-value');
		

	tempoLabel.innerHTML = tempo.value;

	// Start tracks
	var tracks = new Array(
		new Track(),
		new Track(),
		new Track(),
		new Track());

	//Audio Context for Web Audio
	navigator.webkitGetUserMedia({"audio": true}, function(stream) { 
		var mediaStreamSource = context.createMediaStreamSource( stream );
		//mediaStreamSource.connect(context.destination);
	
		tracks[0].init(document.getElementById("track1"), tempo.value, mediaStreamSource);
		tracks[1].init(document.getElementById("track2"), tempo.value, mediaStreamSource);
		tracks[2].init(document.getElementById("track3"), tempo.value, mediaStreamSource);
		tracks[3].init(document.getElementById("track4"), tempo.value, mediaStreamSource);
		
		var tohightlight1 = document.getElementById("track1");
		var tohightlight2 = document.getElementById("track2");
		var tohightlight3 = document.getElementById("track3");
		var tohightlight4 = document.getElementById("track4");

		tohightlight1.addEventListener('click', function() {
			if(isPlaying) tohightlight2.classList.remove('faded');
		});

		tohightlight2.addEventListener('click', function() {
			if(isPlaying) tohightlight3.classList.remove('faded');
		});

		tohightlight3.addEventListener('click', function() {
			if(isPlaying) tohightlight4.classList.remove('faded');
		});

		recorderFinal = new Recorder(output, {
			workerPath: "./js/lib/recorderjs/recorderWorker.js"
		});
	   
		// While we don't figure out what's wrong with changing the animation speed
		// Not needed for release
		changeBPM(false);
		
	},  function(error) {
		$("body").text("Error: you need to allow this sample to use the microphone.")
	});



	// Adjust shown track speed based on master tempo
	tempo.addEventListener('input', function() {
		tempoLabel.innerHTML = tempo.value;
	});

	// But don't change it until it's fully there.
	tempo.addEventListener('change', function() {
		tempo1 = tempo.value;
		changeBPM(true);
	});

	var lastClick;
	var previousValues = [];
	$("#tempo-click").click(function() {
		setTempo();
		lastClick = (new Date()).getTime();
	});

	function setTempo() {
		var newVal = (new Date()).getTime() - lastClick;
		if(newVal != NaN) previousValues.push(newVal);
		if(previousValues.length > 5) {
			previousValues.shift();
			var tot = 0;
			for(var i=0;i<previousValues.length;i++) {
				tot += previousValues[i];
			}
			tot /= previousValues.length;
			tot = 60/tot * 1000;
			if(tot > 60 && tot < 180) {
				tempo.value = tot;
				tempoLabel.innerHTML = tempo.value;
				tempo1 = tempo.value;
				changeBPM(true);
			}
		}
	}

	function changeBPM(reset) {
		current16thNote = 0;
		beatPos = 1;
		for(var i = 0, j = tracks.length; i < j; i++){
			try {
				tracks[i].setBPM(tempo.value);
				tracks[i].source.stop();
			} catch (e) {
				// NOTHING!!!
			}
			if(reset) {
				try {
					tracks[i].resetAllAnimations();
					tracks[i].registerBeat(0);
				} catch (e) {
					// NOTHING!!!!
				}
			}
		}
	}

	
	

	function beat() {
		if(beatPos == 5) beatPos = 1;

		//console.log(beatPos);
		
		for(var i = 0, j = tracks.length; i < j; i++)
			tracks[i].registerBeat(beatPos-1);
		//console.log(beatPos);
		
		
		if(!isMuted) {
			
			metroMute.classList.add('beat');
			setTimeout(function() {
				metroMute.classList.remove('beat');
			}, 50);
		}

		beatPos++;
	}







	/* Basic functions */

	function hasClass(ele,cls) {
		return !!ele.className.match(new RegExp('(\\s|^)'+cls+'(\\s|$)'));
	}

	function addClass(ele,cls) {
		if (!hasClass(ele,cls)) ele.className += " "+cls;
	}

	function removeClass(ele,cls) {
		if (hasClass(ele,cls)) {
			var reg = new RegExp('(\\s|^)'+cls+'(\\s|$)');
			ele.className=ele.className.replace(reg,' ');
		}
	}
	
	window.addEventListener("load", init1 );

	function init1(){
		context = new AudioContext();
		output = context.createGain();
		output.gain.value = 0.8;
		output.connect(context.destination);
		
		timerWorker = new Worker("js/metronomeworker.js");

		timerWorker.onmessage = function(e) {
			if (e.data == "tick") {
			
				scheduler();
			}
			else
					
				console.log("message: " + e.data);
		};
		timerWorker.postMessage({"interval":lookahead});
	 
	
	}
	
})();