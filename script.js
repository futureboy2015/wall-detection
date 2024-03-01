// OpenCVの準備ができたら処理を開始する
cv.onRuntimeInitialized = () => {
  // HTMLのcanvas要素を取得
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  // 画像を読み込む
  const img = new Image();
  img.src = "goodroom_cafe08.jpg"; // 画像のパスを指定してください

  // 画像が読み込まれたら処理を続行
  img.onload = () => {
    // 画像をcanvasに描画
    const canvasWidth = img.width;
    const canvasHeight = img.height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.drawImage(img, 0, 0);

    // クリックイベントリスナーを追加
    canvas.addEventListener("click", (event) => {
      // クリックされた位置を取得
      const x = event.offsetX;
      const y = event.offsetY;

      // 画像データを取得
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = cv.matFromImageData(imageData);

      // Greyscale変換
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const grayCanvas = document.getElementById("canvasGray");
      const ctxGray = grayCanvas.getContext("2d");
      cv.imshow(grayCanvas, gray);

      // HSV変換
      const hsv = new cv.Mat();
      cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
      cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
      const hsvCanvas = document.getElementById("canvasHSV");
      const ctxHSV = hsvCanvas.getContext("2d");
      cv.imshow(hsvCanvas, hsv);

      // S-channelの取得
      const sChannel = new cv.MatVector();
      cv.split(hsv, sChannel);
      // Sチャンネルを取得して新しいMatにマージ
      let sChannelMat = sChannel.get(1).clone();
      const sCanvas = document.getElementById("canvasS");
      const ctxS = sCanvas.getContext("2d");
      cv.imshow(sCanvas, sChannelMat);

      // Blur
      const blurredGray = new cv.Mat();
      cv.GaussianBlur(
        gray,
        blurredGray,
        new cv.Size(3, 3),
        0,
        0,
        cv.BORDER_DEFAULT
      );
      const blurredS = new cv.Mat();
      cv.GaussianBlur(
        sChannelMat,
        blurredS,
        new cv.Size(3, 3),
        0,
        0,
        cv.BORDER_DEFAULT
      );
      const blurredGrayCanvas = document.getElementById("canvasBlurredGray");
      const ctxBlurredGray = blurredGrayCanvas.getContext("2d");
      cv.imshow(blurredGrayCanvas, blurredGray);
      // Canny Edge Detection
      const edgesGray = new cv.Mat();
      cv.Canny(blurredGray, edgesGray, 50, 150, 3, false);
      const edgesS = new cv.Mat();
      cv.Canny(blurredS, edgesS, 50, 150, 3, false);
      const edgesGrayCanvas = document.getElementById("canvasEdgesGray");
      const ctxEdgesGray = edgesGrayCanvas.getContext("2d");
      cv.imshow(edgesGrayCanvas, edgesGray);
      const edgesSCanvas = document.getElementById("canvasEdgesS");
      const ctxEdgesS = edgesSCanvas.getContext("2d");
      cv.imshow(edgesSCanvas, edgesS);

      // Merge Canny Edge Detected Images
      const mergedEdges = new cv.Mat();
      cv.addWeighted(edgesGray, 0.5, edgesS, 0.5, 0, mergedEdges);
      const mergedEdgesCanvas = document.getElementById("canvasMergedEdges");
      const ctxMergedEdges = mergedEdgesCanvas.getContext("2d");
      cv.imshow(mergedEdgesCanvas, mergedEdges);

      // Dilate
      const dilatedEdges = new cv.Mat();
      const M = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(mergedEdges, dilatedEdges, M);
      const dilatedEdgesCanvas = document.getElementById("canvasDilatedEdges");
      const ctxDilatedEdges = dilatedEdgesCanvas.getContext("2d");
      cv.imshow(dilatedEdgesCanvas, dilatedEdges);

      // Flood-fill
      const floodedImage = src.clone();
      const seedPoint = new cv.Point(x, y);
      const color = new cv.Scalar(255, 255, 255, 255); // フラッドフィルの色を指定します
      const loDiff = new cv.Scalar(20, 20, 20, 20); // 下限の色の差分を指定します
      const upDiff = new cv.Scalar(20, 20, 20, 20); // 上限の色の差分を指定します
      cv.floodFill(floodedImage, seedPoint, color, null, loDiff, upDiff);
      const floodedCanvas = document.getElementById("canvasFlooded");
      const ctxFlooded = floodedCanvas.getContext("2d");
      cv.imshow(floodedCanvas, floodedImage);

      // Merge V-channel into flooded image
      const mergedImage = floodedImage.clone();
      const vChannel = new cv.Mat();
      cv.split(hsv, null, null, vChannel, null);
      cv.cvtColor(mergedImage, mergedImage, cv.COLOR_RGBA2RGB);
      cv.merge([vChannel, vChannel, vChannel, new cv.Mat()], mergedImage);
      const mergedCanvas = document.getElementById("canvasMerged");
      const ctxMerged = mergedCanvas.getContext("2d");
      cv.imshow(mergedCanvas, mergedImage);

      // Merge with original image
      const finalImage = new cv.Mat();
      cv.addWeighted(src, 0.5, mergedImage, 0.5, 0, finalImage);
      const finalCanvas = document.getElementById("canvasFinal");
      const ctxFinal = finalCanvas.getContext("2d");
      cv.imshow(finalCanvas, finalImage);

      // メモリ解放
      src.delete();
      gray.delete();
      hsv.delete();
      sChannel.delete();
      blurredGray.delete();
      blurredS.delete();
      edgesGray.delete();
      edgesS.delete();
      mergedEdges.delete();
      dilatedEdges.delete();
      floodedImage.delete();
      vChannel.delete();
      mergedImage.delete();
      finalImage.delete();
      M.delete();
    });
  };
};
