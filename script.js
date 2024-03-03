// ページがロードされたときに実行される関数
window.onload = () => {
  // ページがロードされたらファイル選択ボタンの値をリセットする
  document.getElementById("fileInput").value = null;
};

// OpenCVの準備ができたら処理を開始する
cv.onRuntimeInitialized = () => {
  const cannyMinThres = 30.0;
  const ratio = 2.5;

  // HTMLのcanvas要素を取得
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  // 画像ファイルの読み込み処理
  document.getElementById("fileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      document.getElementById("paintModule").style.display ="block";
      const img = new Image();
      img.src = e.target.result;
      // 画像が読み込まれたら処理を続行
      img.onload = () => {
        paintWall(img);
      };
    };
    reader.readAsDataURL(file);
  });

  /**
   * 画像変換処理
   * @param {*} img 
   */
  function paintWall(img) {
    const canvasWidth = img.width;
    const canvasHeight = img.height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.drawImage(img, 0, 0);

    canvas.addEventListener("click", (event) => {
      // クリックされた位置を取得
      const xPoint = event.offsetX;
      const yPoint = event.offsetY;
      console.log(xPoint);
      console.log(yPoint);

      // 画像データを取得
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = cv.matFromImageData(imageData);

      // RGB取得
      const rgb = new cv.Mat();
      cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

      // グレースケール変換
      const gray = new cv.Mat();
      cv.cvtColor(rgb, gray, cv.COLOR_RGBA2GRAY);
      showImage("canvasGray", gray);

      // HSV変換
      const hsv = new cv.Mat();
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
      showImage("canvasHSV", hsv);

      // Sチャンネル取得
      const sChannel = new cv.MatVector();
      cv.split(hsv, sChannel);
      const sCanvas = document.createElement("canvas");
      showImage("canvasS", sChannel.get(1));
      document.body.appendChild(sCanvas);

      // ぼかし処理(グレースケール)
      const blurredGray = new cv.Mat();
      cv.medianBlur(gray, blurredGray, 3);
      showImage("canvasBlurredGray", blurredGray);

      const blurredSChannel = new cv.Mat();
      cv.medianBlur(sChannel.get(1), blurredSChannel, 3);
      showImage("canvasBlurredS", blurredSChannel);

      // Cannyエッジ検出(グレースケール)
      const edgesGray = new cv.Mat();
      cv.Canny(
        blurredGray,
        edgesGray,
        cannyMinThres,
        cannyMinThres * ratio,
        3,
        false
      );
      showImage("canvasEdgesGray", edgesGray);

      // Cannyエッジ検出(Sチャネル)
      const edgesS = new cv.Mat();
      cv.Canny(
        blurredSChannel,
        edgesS,
        cannyMinThres,
        cannyMinThres * ratio,
        3,
        false
      );
      showImage("canvasEdgesS", edgesS);

      // エッジ画像のマージ
      const mergedEdges = new cv.Mat();
      cv.addWeighted(edgesS, 0.5, edgesGray, 0.5, 0, mergedEdges);
      showImage("canvasMergedEdges", mergedEdges);

      // マスク作成
      const mask = new cv.Mat();
      const maskWidth = Math.floor(edgesGray.height / 8.0);
      const maskHeight = Math.floor(edgesGray.width / 8.0);
      mask.setTo(new cv.Scalar(0.0));
      const M = new cv.Mat(
        Math.floor(maskWidth / 8.0),
        Math.floor(maskHeight / 8.0),
        cv.CV_8UC1,
        new cv.Scalar(0.0)
      );
      // 膨張処理
      const dilatedEdges = new cv.Mat();
      cv.dilate(mergedEdges, dilatedEdges, M);
      showImage("canvasDilatedEdges", dilatedEdges);

      // シードポイントのリサイズ
      const seedPoint = new cv.Point(xPoint, yPoint);
      cv.resize(
        dilatedEdges,
        dilatedEdges,
        new cv.Size(dilatedEdges.cols + 2, dilatedEdges.rows + 2)
      );

      // Flood-fill
      let floodedImage = rgb.clone();
      const floodFillFlag = 8;
      const color = new cv.Scalar(0, 0, 200, 155);
      const loDiff = new cv.Scalar(20, 20, 20, 20);
      const upDiff = new cv.Scalar(20, 20, 20, 20);
      cv.floodFill(
        floodedImage,
        dilatedEdges,
        seedPoint,
        color,
        new cv.Rect(),
        loDiff,
        upDiff,
        floodFillFlag
      );
      showImage("canvasFlooded", floodedImage);

      // 膨張処理(RGB)
      // 最悪無くてもいいか？
      const dilatedRgb = new cv.Mat();
      cv.dilate(floodedImage, dilatedRgb, M, new cv.Point(0.0, 0.0), 0.5);
      showImage("canvasDilatedRgb", dilatedRgb);

      // HSVのマージ
      const rgbHsvImage = new cv.Mat();
      cv.cvtColor(dilatedRgb, rgbHsvImage, cv.COLOR_RGB2HSV);

      // Vチャンネルのマージ
      const sChanelRgbHsvImage = new cv.MatVector();
      cv.split(rgbHsvImage, sChanelRgbHsvImage);

      const mergedImage = new cv.Mat();
      cv.merge(sChanelRgbHsvImage, mergedImage);
      cv.cvtColor(mergedImage, mergedImage, cv.COLOR_HSV2RGB);
      showImage("canvasMerged", mergedImage);

      // 元の画像とのマージ
      const finalImage = new cv.Mat();
      // 数字は結合率(右のを重めに)
      cv.addWeighted(mergedImage, 0.4, rgb, 0.6, 0, finalImage);
      showImage("canvasFinal", finalImage);

      // メモリ解放
      gray.delete();
      hsv.delete();
      sChannel.delete();
      blurredGray.delete();
      edgesGray.delete();
      edgesS.delete();
      mergedEdges.delete();
      M.delete();
      dilatedEdges.delete();
      floodedImage.delete();
      mergedImage.delete();
      finalImage.delete();
    });
  }

  function showImage(canvasId, mat) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");
    cv.imshow(canvas, mat);
  }
};
