// Get sequence ID
var sequenceId  = rth.sequenceId();

// Import display tool
rth.importJS("lib:RthDisplayThreePlaneTools.js");
var displayTools = new RthDisplayThreePlaneTools();

// E1R has the first echo, at the beginning of this stub. 
// Following readouts are adjusted according to this one. 
var xPixels = SB.readout["<E1R>.xRes"];

// Phase Encode Gradient & Phase Encode Gradient 1 are in-plane 
var phaseEncodes = SB.readout["<Phase Encode Gradient>.res"]; // Number of repeats
var zPartitions = SB.readout["<Phase Encode Gradient 2>.res"]; // Number of partitions

var interleaveSteps = SB.readout["<interleave>.numInputs"];

var rectSelected = false;
var slrSelected = true;

// These values are changed in the SB only.
rth.addCommand(new RthUpdateChangeReconstructionParameterCommand(sequenceId, {
  phaseEncodes: phaseEncodes,
  zPartitions: zPartitions
}));
rth.addCommand(new RthUpdateChangeReconstructionParameterCommand(sequenceId, "<interleave>.numInputs", SB.readout["<interleave>.numInputs"]));
rth.addCommand(new RthUpdateChangeReconstructionParameterCommand(sequenceId, "interleaveSteps", interleaveSteps));
for (var i = 0; i < interleaveSteps; i++) {
  rth.addCommand(new RthUpdateChangeReconstructionParameterCommand(sequenceId, "<zPartition" + i + ">.repetitions", SB.readout["<zPartition" + i + ">.repetitions"]));
}

// Get the sequence parameters from the sequencer.
var scannerParameters = new RthUpdateGetParametersCommand(sequenceId);
rth.addCommand(scannerParameters);
var parameterList = scannerParameters.receivedData();

var instanceName = rth.instanceName();

rth.addSeriesDescription(instanceName);

rth.informationInsert(sequenceId, "mri.SequenceName", "VENUS " + instanceName);
rth.informationInsert(sequenceId, "mri.ScanningSequence", "GR");
rth.informationInsert(sequenceId, "mri.SequenceVariant", "SS, SP, ME");
rth.informationInsert(sequenceId, "mri.ScanOptions", "");
rth.informationInsert(sequenceId, "mri.MRAcquisitionType", "3D");
rth.informationInsert(sequenceId, "mri.NumberOfAverages", 1);
rth.informationInsert(sequenceId, "mri.NumberOfCoils", parameterList[2]);
rth.informationInsert(sequenceId, "mri.EchoTrainLength", 6);
rth.informationInsert(sequenceId, "mri.SpoilingState","True");
rth.informationInsert(sequenceId, "mri.SpoilingType","COMBINED");
rth.informationInsert(sequenceId, "mri.SpoilingRFPhaseIncrement",110);
rth.informationInsert(sequenceId, "mri.SpoilerGradientArea", SB.readout["<Plateau Trapezoid>.area"]);
rth.informationInsert(sequenceId, "mri.RxAttenuationManual", "False");

// Set SLR by default
// Note that when this is changed, apd file has to be changed for this to make sense. 
// So without that, exposing this to UI does not make sense. 
rth.addCommand(new RthUpdateEnableBlockCommand(sequenceId, "excitationrect", false));
rth.addCommand(new RthUpdateEnableBlockCommand(sequenceId, "excitationslr", true));

// As there is rewinder in SINC, we should take its duration into account
// to determine TE accurately. In other words, end of that block is not
// equal to the end of SINC pulse.
var rfEnd = SB.excitationslr["<SLR Excitation>.end"];
var rfPeak = SB.excitationslr["<SLR Excitation>.peak"];

// Get minimum TR
var scannerTR = new RthUpdateGetTRCommand(sequenceId, [], []);
rth.addCommand(scannerTR);
var minTR = scannerTR.tr();
var startingTR = 20;
RTHLOGGER_WARNING("PHYSICAL Minimum TR: " + minTR);

//var scannerTR0 = new RthUpdateGetTRCommand(sequenceId, [0,0,0,1], []);
//var scannerTR1 = new RthUpdateGetTRCommand(sequenceId, [0,0,0,1], [1]);
//RTHLOGGER_WARNING("HEY Minimum TR0: " + scannerTR0.tr());
//RTHLOGGER_WARNING("HEY Minimum TR1: " + scannerTR1.tr());

// Specify TE delay interval 
var minTE = rfEnd - rfPeak + SB.readout['<E1R>.readoutCenter'];
//var startingTE = minTE + rth.apdKey("echodelay/duration")/1000; //ms
// Hardcode to 3.5
var startingTE = 3.5; 
rth.informationInsert(sequenceId,"mri.EchoTime",startingTE);
RTHLOGGER_WARNING("Starting TE: " + startingTE);

var echoTime = startingTE;

function updateSequenceParams(selected){
  switch (selected) {
    case "rect":
      rectSelected = true;
      slrSelected = false;
      rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
        ExcitationDuration: SB.excitationrect["<Hard RF>.duration"],
        FlipAngle:SB.excitationrect["<Hard RF>.tip"],
        ExcitationType: "Non-Selective RECT"
      }));
      rth.addCommand(new RthUpdateEnableBlockCommand(sequenceId, "excitationrect", true));
      rth.addCommand(new RthUpdateEnableBlockCommand(sequenceId, "excitationslr", false));
      rfEnd = SB.excitationrect["<Hard RF>.end"];
      rfPeak = SB.excitationrect["<Hard RF>.peak"];
      // Update this so that the TE is accurate
      minTE = rfEnd - rfPeak + SB.readout['<E1R>.readoutCenter'];
      RTHLOGGER_WARNING("Minimum TE  RECT: " + minTE);
      // Set echodelay to the desired value w.r.t pulse selection.
      controlWidget.inputWidget_TE.value = echoTime;
      rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
        EchoTime: echoTime
      }));
      break;
    case "slr":
      rectSelected = false;
      slrSelected = true;
      rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
        ExcitationDuration: SB.excitationslr["<SLR Excitation>.duration"],
        ExcitationTimeBandwidth: SB.excitationslr["<SLR Excitation>.timeBandwidth"],
        FlipAngle:SB.excitationslr["<SLR Excitation>.tip"],
        ExcitationPassBandRippleDB:SB.excitationslr["<SLR Excitation>.passbandRipple"],
        ExcitationStopBandRippleDB:SB.excitationslr["<SLR Excitation>.stopbandRipple"],
        ExcitationEnforceRFLimit:SB.excitationslr["<SLR Excitation>.enforceRFLimit"],
        ExcitationType: "Non-Selective (water exc) LP-SLR"
      }));
      rth.addCommand(new RthUpdateEnableBlockCommand(sequenceId, "excitationrect", false));
      rth.addCommand(new RthUpdateEnableBlockCommand(sequenceId, "excitationslr", true));
      var rfEnd = SB.excitationslr["<Slice Select Gradient>.end"];
      var rfPeak = SB.excitationslr["<RF>.peak"];
      // This is critical
      minTE = rfEnd - rfPeak + SB.readout['<E1R>.readoutCenter'];
      RTHLOGGER_WARNING("Minimum TE SINC: " + minTE);
      controlWidget.inputWidget_TE.value = echoTime;
      rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
        EchoTime: echoTime
      }));
      break;
  }
}


// Starting FOV also depends on CartesianReadout3D.spv
// In SpinBench, FOV is defined in cm. xFOV = yFOV always. 
var startingFOV = SB.readout["<E1R>.fov"]; // cm
// In-plane and other FOVs are equalized and dealt with on SB. 
var startingZFOV = SB.readout["<Phase Encode Gradient>.fov"]; //cm

var startingResolution = startingFOV/xPixels* 10; // mm


// These params are agnostic to the RF selection
// For SS this would correspond to ssg thickness, but in absence it is PEZ FOV.
// In VFA T1 SS 48 but PEZ FOV is 50 (just followed a buffer convention I saw in other apps.)
// TODO: Match these xross apps.
var startingThickness = startingZFOV; // mm
displayTools.setSliceThickness(startingThickness*10);


// To store the current values 
var sliceThickness = startingThickness;
var fieldOfView = startingFOV;

var repetitionTime = startingTR;

rth.informationInsert(sequenceId,"mri.VoxelSpacing",[fieldOfView/xPixels*10,fieldOfView/phaseEncodes*10,startingZFOV/zPartitions*10]);
rth.addCommand(new RthUpdateChangeSliceThicknessCommand(sequenceId, startingZFOV/zPartitions*10));

// Change functions

function changeFOV(fov){
  if (fov<startingFOV) fov = startingFOV; 
  var scale = startingFOV/fov;
  // Scale gradients (x,y,z) assuming in-plane isometry
  rth.addCommand(new RthUpdateScaleGradientsCommand(sequenceId,"readout",scale,scale, 1));
  // Waveforms are not affected by the below: 
  rth.addCommand(new RthUpdateChangeResolutionCommand(sequenceId,startingResolution/scale));
  rth.addCommand(new RthUpdateChangeFieldOfViewCommand(sequenceId, fov*10,fov*10,1));
  // Annotation
  displayTools.setFOV(fov * 10);
  //displayTool.setResolution(startingResolution/scale,startingResolution/scale);
  // Update
  fieldOfView = fov;
}

// This will change TR1, which is set as the global TR. 
// SpinBench sets TR2 using JS logic w.r.t N
function changeTR1(tr1) {

  rth.addCommand(new RthUpdateIntParameterCommand(sequenceId, "", "setDesiredTR", "", (tr1)*1000));
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "RepetitionTime", tr1));

  curTR1 = tr1;
}


function changeTE(te)
{

  // Give some buffer val
  controlWidget.inputWidget_TE.minimum = minTE + 0.1;

  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "EchoTime", te));

  // We need to adjust delay time w.r.t desired TE
  var echoDelay = (te - minTE) * 1000; // Convert to usec
  
  rth.addCommand(new RthUpdateIntParameterCommand(sequenceId, "echodelay", "setDelay", "", echoDelay));
  
  echoTime = te;
}


// Send metadata to recon
rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
  NumberOfCoils: parameterList[2]
  //PreAcqDuration: SB.readout["<Preacquisitions>.duration"]
}));

function changeRxAtten(val)
{
  //RTHLOGGER_WARNING("Setting attenuation to " + val);
  // SET RECEIVER ATTENUATION TO A USER DEFINED VALUE
  rth.addCommand(new RthUpdateFloatParameterCommand(sequenceId, "readout", "setRxAttenuation", "", val));
}
controlWidget.inputWidget_RxAttenuation.valueChanged.connect(changeRxAtten);


controlWidget.inputWidget_RxAttenuation.minimum = 0;
controlWidget.inputWidget_RxAttenuation.maximum = 20;


controlWidget.inputWidget_FOV.minimum = startingFOV;
controlWidget.inputWidget_FOV.maximum = startingFOV*2;
controlWidget.inputWidget_FOV.value   = startingFOV;

controlWidget.inputWidget_TR.minimum = minTR;
controlWidget.inputWidget_TR.maximum = minTR + 30;
controlWidget.inputWidget_TR.value   = minTR;

controlWidget.inputWidget_TE.minimum = minTE;
controlWidget.inputWidget_TE.maximum = 10;
controlWidget.inputWidget_TE.value   = minTE;


function sessionClicked(chck){

  if (chck){
    controlWidget.sessionBIDS.enabled = true;
    controlWidget.sessionBIDS.setText("00");
  }else{
    controlWidget.sessionBIDS.enabled = false;
    controlWidget.sessionBIDS.text = "";
    controlWidget.sessionBIDS.placeholderText = "_ses-<index>";
  }
}

function acqClicked(chck){

  if (chck){
    controlWidget.acqBIDS.enabled = true;
    controlWidget.acqBIDS.setText("freeform");
  }else{
    controlWidget.acqBIDS.enabled = false;
    controlWidget.acqBIDS.text = "";
    controlWidget.acqBIDS.placeholderText = "_acq-<label>";
  }
}

function rectClicked(chck){
  if (chck){
    controlWidget.checkBox_SINC.checked = false;
    updateSequenceParams("rect");
  }
}

function sincClicked(chck){
  if (chck){
    controlWidget.checkBox_RECT.checked = false;
    updateSequenceParams("sinc");
  }
}

var acqLabel = "";
function acqTextChanged(txt){
  acqLabel = txt;
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,"AcquisitionBIDS",acqLabel));

}

var sesIndex = "";
function sesTextChanged(txt){
  sesIndex = txt;
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,"SessionBIDS",sesIndex));

}

var subIndex = "";
function subTextChanged(txt){
  subIndex = txt;
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,"SubjectBIDS",subIndex));


}

function attenuationClicked(chck){

  if (chck){
    controlWidget.inputWidget_RxAttenuation.enabled = true;
    controlWidget.inputWidget_RxAttenuation.value = 0;
    rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "RxAttenuationManual", "True"));
  }else{
    RTHLOGGER_WARNING("Rx attenuation has been disabled.");
    controlWidget.inputWidget_RxAttenuation.enabled = false;
    controlWidget.inputWidget_RxAttenuation.value = 0;
    rth.addCommand(new RthUpdateFloatParameterCommand(sequenceId, "readout", "setRxAttenuation", "", 0));
    rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "RxAttenuationManual", "False"));
  }
}


// Connect UI elements to the callback functions.
controlWidget.isRxAttenuation.toggled.connect(attenuationClicked);
attenuationClicked(controlWidget.isRxAttenuation.checked)

controlWidget.acqBIDS.textChanged.connect(acqTextChanged);
acqTextChanged(controlWidget.acqBIDS.text);

controlWidget.sessionBIDS.textChanged.connect(sesTextChanged);
sesTextChanged(controlWidget.sessionBIDS.text);

controlWidget.subjectBIDS.textChanged.connect(subTextChanged);
subTextChanged(controlWidget.subjectBIDS.text);

controlWidget.isSessionBIDS.toggled.connect(sessionClicked);
sessionClicked(controlWidget.isSessionBIDS.checked)

controlWidget.isAcqBIDS.toggled.connect(acqClicked);
acqClicked(controlWidget.isAcqBIDS.checked)

controlWidget.inputWidget_FOV.valueChanged.connect(changeFOV);
changeFOV(controlWidget.inputWidget_FOV.value);

controlWidget.inputWidget_TR.valueChanged.connect(changeTR1);
changeTR1(controlWidget.inputWidget_TR.value);

controlWidget.inputWidget_TE.valueChanged.connect(changeTE);
changeTE(controlWidget.inputWidget_TE.value);

controlWidget.checkBox_RECT.toggled.connect(rectClicked);
rectClicked(controlWidget.checkBox_RECT.checked)

controlWidget.checkBox_SINC.toggled.connect(sincClicked);
sincClicked(controlWidget.checkBox_SINC.checked)

// ADD LOOP COMMANDS

//var bigAngleCommand = new  RthUpdateFloatParameterCommand(sequenceId, "excitation", "scaleRF", "", 1);
// Following sets FlipAngle to 3 when FA1 = 30 and FA2=25 
//var smallAngleCommand = new  RthUpdateFloatParameterCommand(sequenceId, "excitation", "scaleRF", "", flipAngle2/flipAngle1);

rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
  SubjectBIDS: controlWidget.subjectBIDS.text,
  SessionBIDS: controlWidget.sessionBIDS.text,
  AcquisitionBIDS: controlWidget.acqBIDS.text
}));