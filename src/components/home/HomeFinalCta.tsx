import { Link } from "react-router-dom";

export const HomeFinalCta = () => {
  return (
    <section
      className="relative overflow-hidden py-20 sm:py-28"
      style={{
        backgroundColor: "#1719C9",
        color: "#FFFFFF",
      }}
      aria-label="Final Call to Action"
    >
      {/* Decorative subtle background accents */}
      <div
        className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-25 blur-3xl pointer-events-none"
        style={{
          background: "linear-gradient(135deg, #E6007A 0%, #FF6B00 100%)",
        }}
      />
      <div
        className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{
          background: "linear-gradient(135deg, #C8F500 0%, #FFD600 100%)",
        }}
      />

      {/* Dot Grid overlay */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #FFFFFF 1.5px, transparent 1.5px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="site-container relative z-10 text-center max-w-3xl mx-auto">
        <h2
          className="font-heading text-3xl sm:text-5xl lg:text-6xl font-bold mb-6 text-white leading-tight tracking-tight"
        >
          THE FUTURE STARTS WITH AN IDEA.
        </h2>

        <p className="text-base sm:text-xl text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed">
          Come create, connect and celebrate with us at Supernova 3.0.
        </p>

        {/* Action Buttons: Outlined White Secondary and Lime Primary */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#about"
            className="btn-secondary-white"
            style={{
              height: 52,
              padding: "0 36px",
            }}
          >
            EXPLORE THE EXPO
          </a>

          <Link
            to="/register"
            className="btn-primary"
            style={{
              height: 52,
              padding: "0 36px",
              backgroundColor: "#C8F500",
              color: "#151535",
            }}
          >
            REGISTER NOW
          </Link>
        </div>
      </div>
    </section>
  );
};
