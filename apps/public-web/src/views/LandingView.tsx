import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrScanner } from "@carshow/carshow-components";
import { EntrySearch, PUBLIC_ENTRY_SEARCH_PLACEHOLDER } from "../components/EntrySearch";
import logoHero from "../assets/logo-hero.png";

import l1 from "../assets/photos/l1.jpg";
import l2 from "../assets/photos/l2.jpg";
import l3 from "../assets/photos/l3.jpg";
import l4 from "../assets/photos/l4.jpg";
import l5 from "../assets/photos/l5.jpg";
import l6 from "../assets/photos/l6.jpg";
import l7 from "../assets/photos/l7.jpg";
import p1 from "../assets/photos/p1.jpg";
import p2 from "../assets/photos/p2.jpg";
import p3 from "../assets/photos/p3.jpg";
import p4 from "../assets/photos/p4.jpg";

const LANDSCAPE_PHOTOS = [l1, l2, l3, l4, l5, l6, l7];
const ALL_PHOTOS = [l1, p1, l2, p2, l3, p3, l4, p4, l5, l6, l7];

function useIsDesktop() {
  const mq = useMemo(() => window.matchMedia("(min-width: 600px)"), []);
  const [isDesktop, setIsDesktop] = useState(mq.matches);
  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mq]);
  return isDesktop;
}

export function LandingView() {
  const [current, setCurrent] = useState(0);
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const photos = isDesktop ? LANDSCAPE_PHOTOS : ALL_PHOTOS;

  useEffect(() => {
    document.documentElement.classList.add("landing");
    return () => document.documentElement.classList.remove("landing");
  }, []);

  // Reset to first slide when the photo set changes (desktop ↔ mobile)
  useEffect(() => {
    setCurrent(0);
  }, [isDesktop]);

  useEffect(() => {
    if (photos.length <= 1) return;
    const id = setInterval(() => setCurrent((i) => (i + 1) % photos.length), 5000);
    return () => clearInterval(id);
  }, [photos.length]);

  return (
    <div className="hero-carousel">
      {photos.map((src, i) => (
        <div
          key={src}
          className={`hero-slide${i === current ? " active" : ""}${loadedUrls.has(src) ? " loaded" : ""}`}
          aria-hidden={i !== current}
        >
          <img
            className="hero-slide-img"
            src={src}
            alt=""
            onLoad={() => setLoadedUrls((prev) => new Set([...prev, src]))}
          />
        </div>
      ))}

      <div className="hero-overlay">
        <img src={logoHero} alt="Father's Day Car Show" className="hero-logo" />
        <p className="hero-date">June 21, 2026</p>
        <p className="hero-tagline">Browse the entries, discover amazing cars,<br />and vote for your favourites!</p>
        <div className="hero-actions">
          <button className="hero-browse-btn" onClick={() => navigate("/browse")}>
            Browse Entries
          </button>
          <button className="hero-scan-btn" onClick={() => setScanning(true)}>
            Scan QR Code
          </button>
        </div>
      </div>

      <div className="hero-search">
        <EntrySearch
          onSearch={(num) => navigate(`/browse/entry/${num}`)}
          onTextSearch={setVehicleSearch}
          onSubmitText={(search) => navigate(search ? `/browse?search=${encodeURIComponent(search)}` : "/browse")}
          placeholder={PUBLIC_ENTRY_SEARCH_PLACEHOLDER}
          value={vehicleSearch}
        />
      </div>

      {scanning && (
        <QrScanner
          onScan={(token) => { setScanning(false); navigate(`/v/${token}`); }}
          onClose={() => setScanning(false)}
        />
      )}

      {photos.length > 1 && (
        <div className="hero-dots">
          {photos.map((_, i) => (
            <button
              key={i}
              className={`hero-dot${i === current ? " active" : ""}`}
              onClick={() => setCurrent(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
