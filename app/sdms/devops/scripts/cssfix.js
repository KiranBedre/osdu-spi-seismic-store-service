// ***************************************************************************
// Copyright (c) 2018 Schlumberger. All Rights Reserved. Schlumberger Private.
// ***************************************************************************

const fs = require("fs-jetpack");
const path = require("path");
const inline = require("inline-css");

const CODE_COVERAGE_DIRECTORY = "./coverage";

const files = fs.find(CODE_COVERAGE_DIRECTORY, { matching: "*.html" });

files.forEach(filePath => {
    
    let options = {
       url: "file://" + path.resolve(filePath),
       extraCss: ".wrapper {height: initial;} .clearfix { display: inline-block; } table {width: 1px;} .cline-any, .line-count {font-size: 12px;line-height: 16px;}"
    };

    const data = fs.read(path.resolve(filePath));

    inline(data, options).then(html => {
        let outputFile = path.resolve(filePath);
        fs.write(outputFile, html);
    }).catch(err => { console.log(err); });

});