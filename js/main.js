(function() {
	/*
	 * Track "class"
	 */
	var context = null;
	
	var isPlaying = false;      // Are we currently playing?
	var startTime;              // The start time of the entire sequence.
	var current16thNote;        // What note is currently last scheduled?
	var tempo1 = 120.0;          // tempo (in beats per minute)
	var lookahead = 25.0;       // How frequently to call scheduling function 
	                            //(in milliseconds)
	var scheduleAheadTime = 0.1;    // How far ahead to schedule audio (sec)
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
	
	
	 var STATE_EMPTY = 		"empty";
	 var STATE_COUNT = 		"count";
	 var STATE_REC = 		"rec";
	 var STATE_PLAY = 		"play";
	 var STATE_STOPPED =	"stopped";

	 var Track = function() {
	 	var bpm;
	 	var state;
	 	var beat;
	 	var countdown;

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
	 	var effect;
	 	var beats;

	 	var self;
		
		var recorder;
		var recorder2;
		var recorder3;
		var recorder4;
		var output;
		
		var source;
		
		
	//media stream for microphone   
		
		 	

			

	 	function init(view,bpm) {
			
	
				
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
			this.volume.addEventListener('input', changeVolume);

			this.effect = this.view.getElementsByClassName('track-effect')[0];
			this.effect.addEventListener('change', changeEffect);

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
	 				// Code to record
	 				break;

	 			case(STATE_PLAY):
		 			self.view.classList.add(STATE_PLAY);

	 				// Code to play
	 				break;

	 			case(STATE_STOPPED):
	 				//resetAnimation(self.trackHead);
		 			self.view.classList.add(STATE_PLAY);
		 			self.view.classList.add(STATE_STOPPED);
		 			for(var i = 0, j = self.beats.length; i < j; i++)
		 				self.beats[i].classList.remove('pulse');
	 				// Code to stop
	 				break;

				case(STATE_EMPTY):
	 				self.view.classList.add(STATE_EMPTY);
	 				// Code to delete current track
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
	  
		   
		 //  recorder.clear();
		 // recorder.record();
		  
	 		e.preventDefault();
	 		changeState(STATE_COUNT);
	 	}

	 	function eventPlay(e) {
			/*
			recorder.stop();  
		    recorder.getBuffer(function (buffers) {
		    source = context.createBufferSource();
		    source.buffer = context.createBuffer(1, buffers[0].length, 44100);
		    source.buffer.getChannelData(0).set(buffers[0]);
		    source.buffer.getChannelData(0).set(buffers[1]);
 			source.start(0);
		 	source.connect(output);
		});
	 		*/
			e.preventDefault();
	 		changeState(STATE_PLAY);
	 	}

	 	function eventStop(e) {
	 		e.preventDefault();
	 		changeState(STATE_STOPPED);
	 	}

	 	function eventDelete(e) {
	 		e.preventDefault();
	 		changeState(STATE_EMPTY);
	 	}

	 	function changeEffect(e) {
	 		if(self.effect.selectedIndex == 0)
	 			self.effect.classList.remove('selected');
	 		else
	 			self.effect.classList.add('selected');

	 		var value = self.effect.options[self.effect.selectedIndex].value;
	 		// Change effect
	 		//console.log(value);
	 	}

	 	function changeVolume(e) {
	 		//console.log(self.volume.value);
	 	}

	 	function resetAnimation(element) {
	 		var duration = element.style.animationDuration;
	 		var delay = element.style.animationDelay;
	 		element.style.webkitAnimation = 'none';
	 		setTimeout(function() {
		        element.style.webkitAnimation = '';
		        element.style.animationDuration = duration;
		        element.style.animationDelay = delay;
		    }, 10);
	 	}

	 	function setBPM(bpm) {
	 		this.bpm = bpm;
	 		this.trackHead.style.animationDuration = 4*60/this.bpm + "s";
	 		this.rec.style.animationDuration = 4*60/this.bpm + "s";
	 		this.recEnd.style.animationDuration = 4*60/this.bpm + "s";
	 	}



	 	function registerBeat(beat) {
	 		self.beat = beat;

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
	 		registerBeat: registerBeat
	 	}
	};
	
	/*
	Main code
	*/

	// Start tempo
	document.addEventListener("click", function(){
	    document.getElementById("play");
		
	});

	

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
	   // if ( (noteResolution==2) && (beatNumber%4))	
	     //   return; // we're not playing non-quarter 8th notes

	    // create an oscillator
		 
	    var osc = context.createOscillator();
	    osc.connect( context.destination );
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
		console.log(nextNoteTime);
	    while (nextNoteTime < context.currentTime + scheduleAheadTime ) {
	        scheduleNote( current16thNote, nextNoteTime );
	        nextNote();
	    }
	}

	function play() {
		//console.log(isPlaying);
	    isPlaying = !isPlaying;

	    if (isPlaying) { // start playing
	        current16thNote = 0;
	        nextNoteTime = context.currentTime;
	        timerWorker.postMessage("start");
	        return "stop";
	    } else {
	        timerWorker.postMessage("stop");
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

	tracks[0].init(document.getElementById("track1"), tempo.value);
	tracks[1].init(document.getElementById("track2"), tempo.value);
	tracks[2].init(document.getElementById("track3"), tempo.value);
	tracks[3].init(document.getElementById("track4"), tempo.value);

	// Adjust track speed based on master tempo
	tempo.addEventListener('input', function() {
		tempoLabel.innerHTML = tempo.value;
	});

	// While we don't figure out what's wrong with changing the animation speed
	//Not needed for release
	tempo.addEventListener('change', function() {
		for(var i = 0, j = tracks.length; i < j; i++)
			tracks[i].setBPM(tempo.value);

		//clearInterval(beat);
		//setInterval(beat, 1000*60/tempo.value);
	});

	
	var beatPos = 1;

	function beat() {
		if(beatPos == 5) beatPos = 1;

		//console.log(beatPos);

		for(var i = 0, j = tracks.length; i < j; i++)
			tracks[i].registerBeat(beatPos-1);
		console.log(beatPos);
		beatPos++;
	}

//	setInterval(beat, 1000*60/tempo.value);





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
			
		
		//Audio Context for Web Audio
		navigator.webkitGetUserMedia({"audio": true}, function(stream) { 
	    var mediaStreamSource = context.createMediaStreamSource( stream );
	
   //Track 1 
        recorder = new Recorder(mediaStreamSource, {
   workerPath: "/script/lib/recorderjs/recorderWorker.js"
       });
		
	
   //Track 2 
        recorder2 = new Recorder(mediaStreamSource, {
   workerPath: "/script/lib/recorderjs/recorderWorker.js"
       });
   //Track 3 
        recorder3 = new Recorder(mediaStreamSource, {
   workerPath: "/script/lib/recorderjs/recorderWorker.js"
       });
   //Track 4 
        recorder4 = new Recorder(mediaStreamSource, {
   workerPath: "/script/lib/recorderjs/recorderWorker.js"
       });
   //Final Track
        recorderFinal = new Recorder(output, {
   workerPath: "/script/lib/recorderjs/recorderWorker.js"
       });
		
	},  function(error) {
	  $("body").text("Error: you need to allow this sample to use the microphone.")
	});
	


    timerWorker = new Worker("js/metronomeworker.js");

    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
		
            scheduler();
        }
        else
				
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
	 
	play();
	}
	
	

	
})();



