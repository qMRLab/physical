var sequenceId = rth.sequenceId();
var instanceName = rth.instanceName();

var observer = new RthReconRawObserver();
observer.setSequenceId(sequenceId);
observer.objectName = "Observer";
observer.setPackCoils(false);
observer.observeValueForKey("acquisition.samples", "samples");

observer.scanDisabled.connect(rth.deactivateScanButton);



// var kspace = new Array();

// for (var it = 0; it<=6; it++){
//   kspace[it] = new RthReconKSpace();
//   RTHLOGGER_WARNING("acquisition." + indexKeys[0])
//   if (!this.kspace[it].loadFromReadoutTags(rth.readoutTags("readout"),"acquisition." + indexKeys[0])) {
//     RTHLOGGER_ERROR("Could not load k-space trajectory from readout tags for " + indexKeys[0]);
//   }
// }

function reconBlock(input,indexTR,indexEcho) {
  
  var that  = this;
  
  //this.attenSplit = new RthReconSplitter();
  //this.attenSplit.objectName = "Atten Split " + index;
  //this.attenSplit.setInput(input);
  
  //this.attenOutput = function() {
  //    return this.attenSplit.output(0);
  //};

// acquisition.<E1R>.index --> 0 to 123 
// acquisition.<inter>.input --> 0/1 
 this.sort3d = new RthReconSort();
 this.sort3d.objectName = "sort-TR" + indexTR + "E" + indexEcho;
 //this.sort3d.setInput(this.attenSplit.output(1));
 this.sort3d.setInput(input);
 this.sort3d.setIndexKeys(["reconstruction.echo" + (indexEcho+1) + "CartesianIdx","reconstruction.echo" + (indexEcho+1) + "Z" + indexTR]);
 //this.sort3d.observeKeys(["mri.RunNumber"]);
 this.sort3d.observeKeys(["reconstruction.echoChanged","acquisition.<interleave>.input"]);
 this.sort3d.observedKeysChanged.connect(
  function(keys) {
    that.sort3d.resetAccumulation();
    
    RTHLOGGER_WARNING("Echo changed" + keys["reconstruction.echoChanged"]);
    RTHLOGGER_WARNING("Interleave" + keys["acquisition.<interleave>.input"]);
    RTHLOGGER_WARNING("Idx " + indexEcho + "echo" + keys["reconstruction.echo" + (indexEcho+1) + "CartesianIdx"]);
    RTHLOGGER_WARNING("Sample received" + keys["reconstruction.echo" + (indexEcho+1) + "Samples"]);

    var yEncodes = keys["reconstruction.phaseEncodes"];

    var samples = keys["acquisition.samples"];
    //var coils = keys["acquisition.channels"];
    var zEncodes = keys["reconstruction.zPartitions"];
    //this.sort3d.extent = [samples, coils, yEncodes, zEncodes]; // if the input is [samples x coils]
    that.sort3d.extent = [samples,yEncodes,zEncodes]; // if the input is [samples]
    that.sort3d.accumulate = yEncodes * zEncodes;
  }
);

  this.rawSplit = new RthReconRawSplitter();
  this.rawSplit.objectName = "Split-" + indexTR + "E" + (indexEcho);
  this.rawSplit.setInput(this.sort3d.output());

  this.fft = new RthReconImageFFT();
  this.fft.objectName = "FFT(" + indexTR + "E" + indexEcho;
  this.fft.setInput(this.rawSplit.output(-1));

  this.fermi = new RthReconImageFermiFilter();
  this.fermi.objectName = "Fermi Filter ";
  this.fermi.setWidth(0.01);
  this.fermi.setRadius(0.48);
  this.fermi.setFilterZDirection(true);
  this.fermi.setInput(this.fft.output());

  this.output = function() {
  return this.fermi.output();
  //return this.fft.output();
  };

  this.rawOutput = function() {
    return this.rawSplit.output(-1);
  };

}

function  coilBlock(input,index){
  var that = this;
  this.physData = new Array();

  this.info = new infoBlock(input,index);

  this.router = new RthReconRouteByKeys();
  this.router.objectName = "DATA(Coil " + index + ")";
  // Router index to be altered w.r.t. TR1 and TR2 changes.s
  this.router.setIndexKeys(["reconstruction.echoChanged","acquisition.<interleave>.input"]);
  // This one is not view index, should come from SB hence from control.
  this.router.setMaxIndexKeys(["reconstruction.maxEcho","reconstruction.<interleave>.numInputs"]);
  
  this.router.observeKeys(["reconstruction.interleaveSteps"]);
  this.router.observedKeysChanged.connect(function(keys){
    // that.curTR = keys["acquisition.<interleave>.input"];
    
    // that.echoIdx = that.curEcho - 1;
  
    var datIdx;

    for (var curTR=0; curTR<=1; curTR++){
      for (var echoIdx=0; echoIdx<=6; echoIdx++){

        if (curTR == 0 ){
          datIdx = 2*echoIdx;
        } 
        else {
          datIdx = (2*echoIdx)+1;
        } 
    
        RTHLOGGER_WARNING("DATIDX " + datIdx);
        RTHLOGGER_WARNING("TRIDX " + curTR);
        RTHLOGGER_WARNING("ECHOIDX " + echoIdx);
    
        // For each coil, we emit multiple nodes
        that.physData[datIdx] = new reconBlock(that.router.output(datIdx),curTR,echoIdx);
        sosArray[datIdx].setInput(index,that.physData[datIdx].output());
        packArray[datIdx].setInput(index,that.physData[datIdx].rawOutput());
      }
    }

  });
  this.router.setInput(this.info.output());

  //this.packCoils = new RthReconImagePack();
  //this.packCoils.objectName = "Pack Coils" + index;
// For each `coil we need sort and FFT.
  //this.sos = new RthReconImageSumOfSquares();
  //this.sos.objectName = "SoS" + index;


  //this.splitter = RthReconSplitter();
  //this.splitter.objectName = "splitOutput" + index;
  //this.splitter.setInput(this.sos.output());


  //this.threePlane = new RthImageThreePlaneOutput();
  //this.threePlane.setInput(this.splitter.output(0));
  //this.threePlane.objectName = "gorsel" + index;

  //this.exporter  = new ExportBlock(this.splitter.output(1),index);

}

function  infoBlock(input,index){
  var that  = this;

  var indexKeys = ["acquisition.<E1R>.index","acquisition.<E2R>.index","acquisition.<E3R>.index","acquisition.<E4R>.index","acquisition.<E5R>.index","acquisition.<E6R>.index","acquisition.<E7R>.index"];
  this.fetchEcho = new RthReconImageChangeInformation();
  this.fetchEcho.objectName = "Info"+index;
  
  // Should I observe something different? 
  this.fetchEcho.observeKeys(indexKeys);
  this.fetchEcho.observedKeysChanged.connect(function(keys) {
    
    that.fetchEcho.addTag("reconstruction.maxEcho", 7);
    for (var it = 0; it<=6; it++){
    if (typeof keys[indexKeys[it]] != "undefined"){
      that.fetchEcho.addTag("reconstruction.echoChanged", it);
      that.fetchEcho.addTag("reconstruction.echo" + (it+1) + "CartesianIdx",keys[indexKeys[it]]);
      that.fetchEcho.addTag("reconstruction.echo" + (it+1) + "Samples", keys["acquisition.samples"]);
      // Here zPartition0 or zPartition1 or should exist.
      if (typeof keys["acquisition.<zPartition0>.index"] != "undefined"){
        that.fetchEcho.addTag("reconstruction.echo" + (it+1) + "Z0",keys["acquisition.<zPartition0>.index"]);
      }else{
        that.fetchEcho.addTag("reconstruction.echo" + (it+1) + "Z1",keys["acquisition.<zPartition1>.index"]);
      }
      
    }
  }
  });

  this.output = function() {
    return that.fetchEcho.output();
  };

  this.fetchEcho.setInput(input);
}

var coilArray  = new Array();

function connectCoils(coils){
  for (var i = 0; i<coils; i++){
    coilArray[i] = new coilBlock(observer.output(i),i);
  } 
  rth.collectGarbage();
}

observer.coilsChanged.connect(connectCoils);

//var packCoils = new RthReconImagePack();
//packCoils.objectName = "Pack Coils";
// For each `coil we need sort and FFT.
//var sos = new RthReconImageSumOfSquares();



rth.importJS("lib:RthImageThreePlaneOutput.js");

function ExportBlock(input,inputRaw,trName){

  var that = this;

  var date = new Date();

  

  //var imageExport = new RthReconToQmrlab();
  // This is a bit annoying, but the only option for now. 
  this.imageExport = new RthReconImageExport();

  this.changeInformation = new RthReconImageChangeInformation();

  this.reconKeys = new Array();
  this.reconKeys = [
    // Sequence-specific keys
    "mri.SequenceName",
    "mri.ScanningSequence",
    "mri.SequenceVariant",
    "mri.MRAcquisitionType",
    "mri.NumberOfCoils",
    "mri.ExcitationTimeBandwidth",
    "mri.ExcitationDuration",
    "mri.ExcitationType",
    "mri.VoxelSpacing",
    "mri.EchoTime",
    "mri.RepetitionTime",
    "mri.FlipAngle",
    "reconstruction.phaseEncodes",
    "acquisition.samples",
    "reconstruction.zPartitions",
    "mri.SubjectBIDS",
    "mri.SessionBIDS",
    "mri.AcquisitionBIDS",
    "mri.ExcitationPassBandRippleDB",
    "mri.ExcitationStopBandRippleDB",
    "mri.ExcitationEnforceRFLimit",
    "mri.SpoilingState",
    "mri.SpoilingType",
    "mri.SpoilingRFPhaseIncrement",
    "mri.SpoilerGradientAmplitude",
    "mri.SpoilerGradientDuration",
    "mri.RxAttenuationManual",
  // Generic RTHawk keys
  "geometry.TranslationX",
  "geometry.TranslationY",
  "geometry.TranslationZ",
  "geometry.QuaternionW",
  "geometry.QuaternionX",
  "geometry.QuaternionY",
  "geometry.QuaternionZ",
  "geometry.FieldOfViewX",
  "geometry.FieldOfViewY",
  "geometry.FieldOfViewZ",
  "geometry.SliceThickness",
  "equipment.StationName",
  "equipment.regulatory/chronaxie",
  "equipment.regulatory/coilSar",
  "equipment.regulatory/extremityCoilSar",
  "equipment.regulatory/extremityPeakSar",
  "equipment.regulatory/governingBody",
  "equipment.regulatory/operatingMode",
  "equipment.regulatory/peakSar",
  "equipment.regulatory/reillyPercentage",
  "equipment.regulatory/rheobase",
  "equipment.regulatory/sarScaleFactor",
  "equipment.regulatory/sarUnits",
  "equipment.regulatory/wbSar",
  "equipment.rf/acquisitionDelayResolution",
  "equipment.rf/bodyMaxAvgPower",
  "equipment.rf/localMaxDutyCycle",
  "equipment.rf/localRatedPower",
  "equipment.rf/maxReadoutBw",
  "equipment.rf/maxUniqueReadouts",
  "equipment.rf/rxChannels",
  "equipment.rf/samplingPeriod",
  "equipment.device/acquisitionHost",
  "equipment.coils",
  "equipment.bootTime",
  "equipment.activationDate",
  "equipment.device/manufacturer",
  "equipment.device/manufacturerModelName",
  "equipment.device/deviceSerialNumber",
  "equipment.device/softwareVersions",
  "equipment.device/canChangeDemodulationDelay",
  "equipment.device/controlConnectionBigEndian",
  "equipment.general/apiVersion",
  "equipment.general/currentDateTime",
  "equipment.general/serverVersion",
  "equipment.gradient/dcGain",
  "equipment.gradient/gContIRms",
  "equipment.gradient/nominalRmsGradientLimit",
  "equipment.gradient/nominalRmsSlewSlope",
  "equipment.gradient/samplingPeriod",
  "equipment.gradient/xDbdtDistance",
  "equipment.gradient/xMaximumAmplitude",
  "equipment.gradient/xRiseTime",
  "equipment.gradient/xShimRes",
  "equipment.gradient/xWarpCoefficients",
  "equipment.gradient/yDbdtDistance",
  "equipment.gradient/yMaximumAmplitude",
  "equipment.gradient/yRiseTime",
  "equipment.gradient/yShimRes",
  "equipment.gradient/yWarpCoefficients",
  "equipment.gradient/zDbdtDistance",
  "equipment.gradient/zMaximumAmplitude",
  "equipment.gradient/zRiseTime",
  "equipment.gradient/zShimRes",
  "equipment.gradient/zWarpCoefficients",
  "equipment.hardwareAddress",
  "equipment.InstitutionAddress",
  "equipment.InstitutionalDepartmentName",
  "equipment.InstitutionName",
  "equipment.licenseType",
  "equipment.magnet/fieldStrength",
  "equipment.udiLIC",
  "equipment.udiPCNMajor",
  "equipment.udiPCNPrefix",
  "equipment.udiUMID",
  "equipment.prescan/refVoltage",
  "equipment.prescan/tg",
  "equipment.prescan/maxB1",
  "equipment.prescan/cf",
  "equipment.prescan/nucleus",
  "equipment.prescan/r1",
  "equipment.prescan/r2",
  "equipment.prescan/refPulseInGauss",
  "equipment.prescan/status",
  "equipment.prescan/xs",
  "equipment.prescan/ys",
  "equipment.prescan/zs",
  "equipment.hostManufacturerModelName",
  "equipment.hostSoftwareVersions",
  "equipment.magnet/fieldStrength",
  "acquisition.peakAmplitude",
  "acquisition.readoutReferencePoint",
  "acquisition.resolution",
  "acquisition.samples",
  "acquisition.samplingRate",
  "acquisition.SequenceId",
  "acquisition.slice",
  "acquisition.triggerCount",
  "acquisition.triggerLead",
  "acquisition.timesincetrig",
  "acquisition.view",
  "patient.AdditionalPatientHistory",
  "patient.PatientAge",
  "patient.PatientBirthDate",
  "patient.PatientID",
  "patient.PatientName",
  "patient.PatientSex",
  "patient.PatientWeight",
  "reconstruction.loopIndexNames",
  "reconstruction.blockNames",
  "series.interfaceState", 
  "series.Modality",
  "series.offsetFromUTC",
  "series.PatientPosition",
  "series.PrescribedGeometry",
  "series.ProtocolName",
  "series.SeriesDescription",
  "series.timezone",
  "exportedSeries.BodyPartExamined",
  "exportedSeries.FrameOfReferenceUID",
  "study.DBdtMode",
  "study.ImagedNucleus",
  "study.MagneticFieldStrength",
  "study.ReceiveCoilName",
  "study.StudyDate",
  "study.StudyDescription",
  "study.StudyTime",
  "equipment.prescan/cf",
  "acquisition.rxAttenuation",
  "acquisition.channels",
  ];

  // Siemens specific keys 
  this.siemensKeys = new Array();
  this.siemensKeys = [
    "equipment.gradient/siemens/asCOMP_0/tModuleName",
    "equipment.gradient/siemens/asCOMP_0/tName",
    "equipment.gradient/siemens/asGPAParameters_0/ai32GradRegX_0",
    "equipment.gradient/siemens/asGPAParameters_0/ai32GradRegY_0",
    "equipment.gradient/siemens/asGPAParameters_0/ai32GradRegZ_0",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradClipRiseTime",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplAbsolute",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplFast",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplNominal",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplNormal",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplWhisper",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMinRiseTimeAbsolute",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMinRiseTimeAbsolute",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMinRiseTimeFast",
    "equipment.gradient/siemens/asGPAParameters_0/flGradDelayX",
    "equipment.gradient/siemens/asGPAParameters_0/flGradDelayY",
    "equipment.gradient/siemens/asGPAParameters_0/flGradDelayZ",
    "equipment.gradient/siemens/asGPAParameters_0/flGradSensitivityX",
    "equipment.gradient/siemens/asGPAParameters_0/flGradSensitivityY",
    "equipment.gradient/siemens/asGPAParameters_0/flGradSensitivityZ",
    "equipment.gradient/siemens/asGPAParameters_0/flSysMaxAmplAbsolute_0",
    "equipment.gradient/siemens/asGPAParameters_0/flSysMaxAmplAbsolute_1",
    "equipment.gradient/siemens/asGPAParameters_0/flSysMaxAmplAbsolute_2",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flFoVMax",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flFreqDependentResistanceLinear",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flFreqDependentResistanceQuadratic",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flGScaleFactorX",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flGScaleFactorY",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flGScaleFactorZ",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/tType",
    "equipment.gradient/siemens/asGPAParameters_0/tType",
    "equipment.gradient/siemens/flGSWDAX_0",
    "equipment.gradient/siemens/flGSWDAX_1",
    "equipment.gradient/siemens/flGSWDAX_2",
    "equipment.gradient/siemens/flGSWDAY_0",
    "equipment.gradient/siemens/flGSWDAY_1",
    "equipment.gradient/siemens/flGSWDAY_2",
    "equipment.gradient/siemens/flGSWDAZ_0",
    "equipment.gradient/siemens/flGSWDAZ_1",
    "equipment.gradient/siemens/flGSWDAZ_2",
    "equipment.gradient/siemens/flGSWDHWCorrectionFactorX",
    "equipment.gradient/siemens/flGSWDHWCorrectionFactorY",
    "equipment.gradient/siemens/flGSWDHWCorrectionFactorZ",
    "equipment.gradient/siemens/flSHIMMaxGradOffset",
    "equipment.gradient/siemens/lGSWDPhaseEncodingLines_0",
    "equipment.gradient/siemens/lGSWDPhaseEncodingLines_1",
    "equipment.gradient/siemens/lGSWDPhaseEncodingLines_2",
    "equipment.gradient/siemens/lGSWDtd_0_0",
    "equipment.gradient/siemens/lGSWDtd_0_1",
    "equipment.gradient/siemens/lGSWDtd_0_2",
    "equipment.gradient/siemens/lGSWDtd_0_3",
    "equipment.gradient/siemens/tGradientEngine"
  ];

  // GE specific keys 
  this.geKeys = new Array();
  this.geKeys = [
    "equipment.Signa/Gradient/xrisetime",
    "equipment.Signa/Gradient/yrisetime",
    "equipment.Signa/Gradient/zrisetime",
    "equipment.Signa/Gradient/systemmaxfov",
    "equipment.Signa/Gradient/xamptran",
    "equipment.Signa/Gradient/yamptran",
    "equipment.Signa/Gradient/zamptran",
    "equipment.Signa/Gradient/xfsamp",
    "equipment.Signa/Gradient/yfsamp",
    "equipment.Signa/Gradient/zfsamp",
    "equipment.Signa/Gradient/xirms",
    "equipment.Signa/Gradient/yirms",
    "equipment.Signa/Gradient/zirms",
    "equipment.Signa/Gradient/xiavrgabs",
    "equipment.Signa/Gradient/yiavrgabs",
    "equipment.Signa/Gradient/ziavrgabs",
    "equipment.Signa/Gradient/xps_avghvpwrlimit",
    "equipment.Signa/Gradient/xps_avglvpwrlimit",
    "equipment.Signa/Gradient/xps_avgpdulimit",
    "equipment.Signa/Gradient/psdgraddelayx",
    "equipment.Signa/Gradient/psdgraddelayy",
    "equipment.Signa/Gradient/psdgraddelayz",
    "equipment.Signa/Gradient/psdgradwait",
    "equipment.Signa/Gradient/psdrfwait",
    "equipment.Signa/Gradient/srmode",
    "equipment.Signa/Gradient/slew_arthigh",
    "equipment.Signa/Gradient/slew_artmedium",
    "equipment.Signa/Gradient/maxb1rms",
    "equipment.Signa/Gradient/lcoil",
    "equipment.Signa/Gradient/gradient_coil_temperature_base_c",
    "equipment.Signa/Gradient/gradient_coil_temperature_limit_c",
    "equipment.Signa/Gradient/gradient_coil_time_constant_s",
    "equipment.Signa/Gradient/gradient_coil_power_ss_limit_kw",
    "equipment.Signa/Gradient/dbdtdistx",
    "equipment.Signa/Gradient/dbdtdisty",
    "equipment.Signa/Gradient/dbdtdistz",
    "equipment.Signa/Gradient/gburstime",
    "equipment.Signa/Gradient/gcoiltype",
    "equipment.Signa/Gradient/gmax_arthigh",
    "equipment.Signa/Gradient/gmax_artmedium",
    "equipment.Signa/Gradient/gpeakirms",
    "equipment.Signa/Gradient/coilac_gain",
    "equipment.Signa/Gradient/coilac_gain",
    "equipment.Signa/Gradient/coildc_fftpoints",
    "equipment.Signa/MR/rfmaxattenuation",
    "equipment.Signa/MR/rfampftquadratic",
    "equipment.Signa/MR/rfampftlinear",
    "equipment.Signa/MR/rfdelay"
  ];

  this.changeInformation.observeKeys(["equipment.device/manufacturer"]);
  this.imageExport.observedKeysChanged.connect(function(keys){
    if (keys["equipment.device/manufacturer"] == "GE MEDICAL SYSTEMS"){
      RTHLOGGER_WARNING('Appending metadata for ' + keys["equipment.device/manufacturer"]);
      that.reconKeys = that.reconKeys.concat(that.geKeys);
      for (var i = 0; i<that.reconKeys.length; i++){
        that.imageExport.addInformationKey(that.reconKeys[i]);
      }
    }else{
      RTHLOGGER_WARNING('Appending metadata for ' + keys["equipment.device/manufacturer"]);
      that.reconKeys = that.reconKeys.concat(that.siemensKeys);
      for (var i = 0; i<that.reconKeys.length; i++){
        that.imageExport.addInformationKey(that.reconKeys[i]);
      }
    }
  
  });


  this.imageExport.observeKeys([
    "mri.SubjectBIDS",
    "mri.SessionBIDS"
  ]);
  this.imageExport.observedKeysChanged.connect(function(keys){

    var exportDirectory = "qMRLabAcq/rthRecon/";
    var subjectBIDS  = "sub-" + keys["mri.SubjectBIDS"];
    var sessionBIDS = (keys["mri.SessionBIDS"]) ? "_ses-" + keys["mri.SessionBIDS"] : "";
    //var acquisitionBIDS = (keys["mri.AcquisitionBIDS"]) ? "_acq-" + keys["mri.AcquisitionBIDS"] : "";
    var exportFileName  = exportDirectory + subjectBIDS + sessionBIDS + trName + "_TB1AFI.dat";
    that.imageExport.setFileName(exportFileName);
  });
  
  this.imageExport.objectName = "save_image" + trName;
  
  this.imageExport.setInput(input);

  this.imageExportRaw = new RthReconImageExport();
  this.imageExportRaw.objectName = "save_raw" + trName;
  this.imageExportRaw.observeKeys([
    "mri.SubjectBIDS",
    "mri.SessionBIDS"
  ]);
  this.imageExportRaw.observedKeysChanged.connect(function(keys){
    var exportDirectory = "qMRLabAcq/rthRaw/";
    var subjectBIDS  = "sub-" + keys["mri.SubjectBIDS"];
    var sessionBIDS = (keys["mri.SessionBIDS"]) ? "_ses-" + keys["mri.SessionBIDS"] : "";
    //var acquisitionBIDS = (keys["mri.AcquisitionBIDS"]) ? "_acq-" + keys["mri.AcquisitionBIDS"] : "";
    var exportFileNameRaw  = exportDirectory + subjectBIDS + sessionBIDS + trName + "_TB1AFIraw.dat";
    that.imageExportRaw.setFileName(exportFileNameRaw);
  });

  this.imageExportRaw.setInput(inputRaw);
  //this.imageExportRaw.setKSpace(kspace);

  //this.imageExport.saveFileSeries(true);

}


//var splitter = RthReconSplitter();
//splitter.objectName = "splitOutput";
//splitter.setInput(sos.output());

//var threePlane = new RthImageThreePlaneOutput();
//threePlane.setInput(splitter.output(0));

//var exporter  = new ExportBlock(splitter.output(1),packCoils.output());

//var getRxAtten = new RthUpdateGetRxAttenuationCommand(sequenceId, "readout"); rth.addCommand(getRxAtten);
//var atten = getRxAtten.receivedData();
//RTHLOGGER_WARNING("AFI recon attenuation received " + atten);

//var rxAtten0 = new RthReconRawApplyRxAttenuation();
//rxAtten0.objectName = "Rx Atten 0";
//rxAtten0.lowerLimit = 0.3;
//rxAtten0.upperLimit = 0.75;
//rxAtten0.newAttenuation.connect(function(newAtten) {
//  RTHLOGGER_ERROR("Received atten is (afi in function tr1)" + newAtten);
//  rth.addCommand(new RthUpdateFloatParameterCommand(sequenceId, "readout", "setRxAttenuation", "", newAtten));
//});

//var rxAtten1 = new RthReconRawApplyRxAttenuation();
//rxAtten1.objectName = "Rx Atten 1";
//rxAtten1.lowerLimit = 0.3;
//rxAtten1.upperLimit = 0.75;
//rxAtten1.newAttenuation.connect(function(newAtten) {
//  RTHLOGGER_ERROR("Received atten is (afi in function tr2)" + newAtten);
//  rth.addCommand(new RthUpdateFloatParameterCommand(sequenceId, "readout", "setRxAttenuation", "", newAtten));
//});


var sosArray = new Array();
var packArray = new Array();
var splitterArray = new Array();
var tpArray = new Array();
var xpArray = new Array();

// There should be 14 of these guys, we have 14 images...
for (var it = 0; it<=13; it++){
  sosArray[it] = new RthReconImageSumOfSquares();
  sosArray[it].objectName = "SoS" + (it+1)
  packArray[it] = new RthReconImagePack();
  packArray[it].objectName = "coilPack" + (it+1);
  splitterArray[it] = new RthReconSplitter();
  splitterArray[it].objectName = "splitOutput" + (it+1);
  splitterArray[it].setInput(this.sosArray[it].output());
  tpArray[it] = new RthImageThreePlaneOutput();
  tpArray[it].setInput(this.splitterArray[it].output(0));
  xpArray[it]  = new ExportBlock(this.splitterArray[it].output(1),packArray[it].output(),"_echo-" + (it+1));
}

// sos0 = new RthReconImageSumOfSquares();
// sos0.objectName = "SoS0";

// var sos1 = new RthReconImageSumOfSquares();
// sos1.objectName = "SoS1";

// var pack0 = new RthReconImagePack();
// pack0.objectName = "coilPack0";

// var pack1 = new RthReconImagePack();
// pack1.objectName = "coilPack1";

// var splitter0 = RthReconSplitter();
// splitter0.objectName = "splitOutput 0";
// splitter0.setInput(this.sos0.output());

// var splitter1 = RthReconSplitter();
// splitter1.objectName = "splitOutput 1";
// splitter1.setInput(this.sos1.output());

// threePlane0 = new RthImageThreePlaneOutput();
// threePlane0.setInput(this.splitter0.output(0));

// threePlane1 = new RthImageThreePlaneOutput();
// threePlane1.setInput(this.splitter1.output(0));

// exporter0  = new ExportBlock(this.splitter0.output(1),pack0.output(),'_acq-tr1');
// exporter1  = new ExportBlock(this.splitter1.output(1),pack1.output(),'_acq-tr2');