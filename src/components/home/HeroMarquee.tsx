export const HeroMarquee = () => {
  const row1Words = [
    { text: "SUPERNOVA 3.0", type: "solid" },
    { text: "·", type: "dot" },
    { text: "CREATE", type: "outlined" },
    { text: "·", type: "dot" },
    { text: "CONNECT", type: "lime" },
    { text: "·", type: "dot" },
    { text: "CELEBRATE", type: "solid" },
    { text: "·", type: "dot" },
    { text: "INNOVATION EXPO", type: "outlined" },
    { text: "·", type: "dot" },
    { text: "20–21 NOV 2026", type: "lime" },
    { text: "·", type: "dot" },
  ];

  const row2Words = [
    { text: "SCIENCE EXPO", type: "lime" },
    { text: "·", type: "dot" },
    { text: "ANIMATION SHOWCASE", type: "solid" },
    { text: "·", type: "dot" },
    { text: "ESPORTS TOURNAMENT", type: "outlined" },
    { text: "·", type: "dot" },
    { text: "IDEAS IN MOTION", type: "lime" },
    { text: "·", type: "dot" },
    { text: "THE NATIONAL COLLEGE", type: "solid" },
    { text: "·", type: "dot" },
    { text: "BENGALURU", type: "outlined" },
    { text: "·", type: "dot" },
  ];

  // Repeat twice for seamless infinite marquee loop
  const repeatedRow1 = [...row1Words, ...row1Words];
  const repeatedRow2 = [...row2Words, ...row2Words];

  return (
    <div className="marquee-wrapper" aria-hidden="true">
      {/* Row 1: Leftward movement */}
      <div className="marquee-track marquee-forward">
        {repeatedRow1.map((item, idx) => (
          <span
            key={`r1-${idx}`}
            className={`marquee-item ${
              item.type === "outlined"
                ? "outlined"
                : item.type === "lime"
                ? "lime"
                : ""
            }`}
          >
            {item.text}
          </span>
        ))}
      </div>

      {/* Row 2: Rightward movement */}
      <div className="marquee-track marquee-reverse">
        {repeatedRow2.map((item, idx) => (
          <span
            key={`r2-${idx}`}
            className={`marquee-item ${
              item.type === "outlined"
                ? "outlined"
                : item.type === "lime"
                ? "lime"
                : ""
            }`}
          >
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
};
