"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type RoomStatus = "waiting" | "playing" | "result" | "finished";
type RoundStatus = "playing" | "result" | "done";

type Room = {
  id: string;
  code: string;
  host_player_id: string | null;
  status: RoomStatus;
  current_round: number;
  max_rounds: number;
  difficulty: number;
  created_at: string;
};

type Player = {
  id: string;
  room_id: string;
  name: string;
  score: number;
  is_online: boolean;
  joined_at: string;
};

type Question = {
  title: string;
  source: string;
  answer: string[];
};

type GameRound = {
  id: string;
  room_id: string;
  round_number: number;
  question_json: Question;
  answer_json: string[];
  started_at: string | null;
  ends_at: string | null;
  status: RoundStatus;
  created_at: string;
};

type Submission = {
  id: string;
  room_id: string;
  round_id: string;
  player_id: string;
  ordered_items_json: string[];
  total_error: number;
  weighted_error: number;
  score_gain: number;
  drink_penalty: string;
  submitted_at: string;
};

const fallbackQuestions: Question[] = [
  {
    title: "한국인이 좋아하는 야식 Top 5",
    source: "샘플 설문 데이터",
    answer: ["치킨", "라면", "족발/보쌈", "떡볶이", "피자"],
  },
  {
    title: "술자리에서 분위기 깨는 행동 Top 5",
    source: "샘플 설문 데이터",
    answer: [
      "계속 휴대폰만 보기",
      "술 강요하기",
      "혼자 진지한 얘기만 하기",
      "계산할 때 사라지기",
      "같은 말 반복하기",
    ],
  },
  {
    title: "직장인이 뽑은 꼴불견 동료 Top 5",
    source: "샘플 설문 데이터",
    answer: [
      "남 탓하는 사람",
      "말만 하고 일 안 하는 사람",
      "지각이 잦은 사람",
      "뒷담화하는 사람",
      "공을 가로채는 사람",
    ],
  },
  {
    title: "친구에게 가장 서운한 순간 Top 5",
    source: "샘플 설문 데이터",
    answer: [
      "약속을 쉽게 취소할 때",
      "내 얘기를 안 들을 때",
      "연락을 일부러 늦게 볼 때",
      "돈 문제로 애매하게 굴 때",
      "비밀을 말했을 때",
    ],
  },
  {
    title: "소개팅에서 호감 떨어지는 행동 Top 5",
    source: "샘플 설문 데이터",
    answer: [
      "무례한 말투",
      "계속 휴대폰 보기",
      "전 연인 이야기",
      "일방적인 자기 자랑",
      "계산 매너 없음",
    ],
  },
  {
    title: "한국인이 선호하는 배달음식 Top 5",
    source: "샘플 설문 데이터",
    answer: ["치킨", "중식", "피자", "분식", "족발/보쌈"],
  },
  {
    title: "여행 가서 가장 먼저 하는 일 Top 5",
    source: "샘플 설문 데이터",
    answer: ["숙소 체크인", "맛집 찾기", "사진 찍기", "카페 가기", "기념품 구경"],
  },
  {
    title: "카톡 답장이 늦어지는 이유 Top 5",
    source: "샘플 설문 데이터",
    answer: ["바빠서", "뭐라고 답할지 몰라서", "귀찮아서", "알림을 못 봐서", "일부러 시간을 두려고"],
  },
  {
    title: "노래방에서 자주 부르는 장르 Top 5",
    source: "샘플 설문 데이터",
    answer: ["발라드", "댄스곡", "아이돌 노래", "힙합", "트로트"],
  },
  {
    title: "스트레스 받을 때 먹고 싶은 음식 Top 5",
    source: "샘플 설문 데이터",
    answer: ["매운 음식", "치킨", "떡볶이", "디저트", "라면"],
  },
];

function makeRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function shuffle<T>(array: T[]) {
  const copied = [...array];

  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }

  return copied;
}

function getDrinkPenalty(weightedError: number) {
  if (weightedError <= 1.5) return "안 마심";
  if (weightedError <= 3.8) return "반 잔";
  if (weightedError <= 6.5) return "한 잔";
  return "두 잔";
}

function calculateScore(answer: string[], orderedItems: string[], difficulty: number) {
  let totalError = 0;

  orderedItems.forEach((item, index) => {
    const correctIndex = answer.indexOf(item);

    if (correctIndex === -1) {
      totalError += 5;
      return;
    }

    const diff = Math.abs(correctIndex - index);
    totalError += diff;
  });

  const weightedError = Number((totalError * difficulty).toFixed(1));
  const scoreGain = Math.max(0, Math.round(100 - weightedError * 13));
  const drinkPenalty = getDrinkPenalty(weightedError);

  return {
    totalError,
    weightedError,
    scoreGain,
    drinkPenalty,
  };
}

function formatTime(seconds: number) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;

  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function Home() {
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState<GameRound | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const [playerId, setPlayerId] = useState("");
  const [orderedItems, setOrderedItems] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tick, setTick] = useState(0);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  const isHost = room?.host_player_id === playerId;

  const mySubmission = useMemo(() => {
    return submissions.find((submission) => submission.player_id === playerId) ?? null;
  }, [submissions, playerId]);

  const remainingSeconds = useMemo(() => {
    if (!currentRound?.ends_at) return 0;

    const endTime = new Date(currentRound.ends_at).getTime();
    const correctedNow = Date.now() + serverTimeOffset;

    return Math.max(0, Math.ceil((endTime - correctedNow) / 1000));
  }, [currentRound?.ends_at, tick, serverTimeOffset]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => b.score - a.score);
  }, [players]);

  const fetchRoomState = useCallback(async (targetRoomId: string) => {
const { data: roomData, error: roomError } = await supabase
  .from("rooms")
  .select("*")
  .eq("id", targetRoomId)
  .maybeSingle();

if (roomError) {
  console.warn("Room fetch failed:", {
    message: roomError.message,
    details: roomError.details,
    hint: roomError.hint,
    code: roomError.code,
    raw: roomError,
  });

  setMessage("방 정보를 불러오지 못했어. 다시 처음부터 시작해줘.");
  return;
}

if (!roomData) {
  console.warn("Saved room does not exist anymore. Resetting local state.");

  localStorage.clear();

  setRoom(null);
  setPlayers([]);
  setCurrentRound(null);
  setSubmissions([]);
  setPlayerId("");
  setOrderedItems([]);
  setPlayerName("");
  setJoinCode("");
  setMessage("이전 방 정보를 찾을 수 없어서 초기화했어. 새 방을 만들어줘.");

  return;
}

    const typedRoom = roomData as Room;
    setRoom(typedRoom);

    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", targetRoomId)
      .order("joined_at", { ascending: true });

    if (playerError) {
      console.error("Players fetch error:", playerError);
      return;
    }

    setPlayers((playerData ?? []) as Player[]);

    if (typedRoom.current_round > 0) {
      const { data: roundData, error: roundError } = await supabase
        .from("rounds")
        .select("*")
        .eq("room_id", targetRoomId)
        .eq("round_number", typedRoom.current_round)
        .maybeSingle();

      if (roundError) {
        console.error("Round fetch error:", roundError);
        return;
      }

      if (!roundData) {
        return;
      }

      const typedRound = roundData as GameRound;
      setCurrentRound(typedRound);

      const { data: submissionData, error: submissionError } = await supabase
        .from("submissions")
        .select("*")
        .eq("round_id", typedRound.id);

      if (submissionError) {
        console.error("Submissions fetch error:", submissionError);
        return;
      }

      setSubmissions((submissionData ?? []) as Submission[]);

      const savedRoundId = localStorage.getItem("currentRoundId");
      if (savedRoundId !== typedRound.id) {
        localStorage.setItem("currentRoundId", typedRound.id);
        setOrderedItems(shuffle(typedRound.question_json.answer));
        setMessage("");
        setIsSubmitting(false);
      }
    } else {
      setCurrentRound(null);
      setSubmissions([]);
      localStorage.removeItem("currentRoundId");
    }
  }, []);

async function syncServerTime() {
  const startedAt = Date.now();

  const { data, error } = await supabase.rpc("get_server_time");

  const endedAt = Date.now();

  if (error || !data) {
    console.warn("Server time sync failed:", {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      raw: error,
    });
    return;
  }

  const roundTripMs = endedAt - startedAt;
  const estimatedServerNow = new Date(data).getTime() + roundTripMs / 2;

  setServerTimeOffset(estimatedServerNow - endedAt);
}

  async function getCorrectedServerNow() {
    const startedAt = Date.now();

    const { data, error } = await supabase.rpc("get_server_time");

    const endedAt = Date.now();

    if (error || !data) {
      console.error("Server time fetch error:", error);
      return new Date(Date.now() + serverTimeOffset);
    }

    const roundTripMs = endedAt - startedAt;
    const estimatedServerNow = new Date(data).getTime() + roundTripMs / 2;

    return new Date(estimatedServerNow);
  }

  function forceReset() {
    localStorage.clear();

    setRoom(null);
    setPlayers([]);
    setCurrentRound(null);
    setSubmissions([]);
    setPlayerId("");
    setOrderedItems([]);
    setPlayerName("");
    setJoinCode("");
    setMessage("");
    setIsSubmitting(false);

    window.location.replace("/");
  }

  function ForceResetButton() {
    return (
      <button
        onClick={forceReset}
        className="fixed right-4 top-4 z-50 rounded-2xl border border-white/10 bg-black/70 px-4 py-3 text-sm font-bold text-white backdrop-blur-xl"
      >
        초기화
      </button>
    );
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldReset = params.get("reset") === "1";

    if (shouldReset) {
      localStorage.clear();

      setRoom(null);
      setPlayers([]);
      setCurrentRound(null);
      setSubmissions([]);
      setPlayerId("");
      setOrderedItems([]);
      setPlayerName("");
      setJoinCode("");
      setMessage("");
      setIsSubmitting(false);

      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    const savedRoomId = localStorage.getItem("roomId");
    const savedPlayerId = localStorage.getItem("playerId");
    const savedPlayerName = localStorage.getItem("playerName");

    if (savedRoomId && savedPlayerId) {
      setPlayerId(savedPlayerId);
      setPlayerName(savedPlayerName ?? "");
      fetchRoomState(savedRoomId);
    }
  }, [fetchRoomState]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    syncServerTime();

    const timer = setInterval(() => {
      syncServerTime();
    }, 30000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const savedRoomId = localStorage.getItem("roomId");

      if (savedRoomId) {
        fetchRoomState(savedRoomId);
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [fetchRoomState]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`room-realtime-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        () => {
          fetchRoomState(room.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          fetchRoomState(room.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rounds",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          fetchRoomState(room.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          fetchRoomState(room.id);
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, fetchRoomState]);

  useEffect(() => {
    if (!room || !currentRound) return;
    if (room.status !== "playing") return;
    if (players.length === 0) return;

    const allSubmitted = submissions.length >= players.length;
    const timeEnded = remainingSeconds <= 0;

    if ((allSubmitted || timeEnded) && isHost) {
      revealRoundResult();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    room?.status,
    currentRound?.id,
    players.length,
    submissions.length,
    remainingSeconds,
    isHost,
  ]);

  async function createRoom() {
    if (!playerName.trim()) {
      setMessage("이름을 먼저 입력해줘");
      return;
    }

    setMessage("방 만드는 중...");

    const code = makeRoomCode();

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .insert({
        code,
        status: "waiting",
        current_round: 0,
        max_rounds: 10,
        difficulty: 1,
      })
      .select()
      .single();

    if (roomError || !roomData) {
      setMessage(`방 만들기 실패: ${roomError?.message ?? "알 수 없는 오류"}`);
      return;
    }

    const createdRoom = roomData as Room;

    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .insert({
        room_id: createdRoom.id,
        name: playerName.trim(),
        score: 0,
        is_online: true,
      })
      .select()
      .single();

    if (playerError || !playerData) {
      setMessage(`플레이어 생성 실패: ${playerError?.message ?? "알 수 없는 오류"}`);
      return;
    }

    const createdPlayer = playerData as Player;

    await supabase
      .from("rooms")
      .update({
        host_player_id: createdPlayer.id,
      })
      .eq("id", createdRoom.id);

    localStorage.setItem("roomId", createdRoom.id);
    localStorage.setItem("roomCode", createdRoom.code);
    localStorage.setItem("playerId", createdPlayer.id);
    localStorage.setItem("playerName", createdPlayer.name);

    setPlayerId(createdPlayer.id);
    setMessage("방 만들기 성공!");

    await fetchRoomState(createdRoom.id);
  }

  async function joinRoom() {
    if (!playerName.trim()) {
      setMessage("이름을 먼저 입력해줘");
      return;
    }

    if (!joinCode.trim()) {
      setMessage("방 코드를 입력해줘");
      return;
    }

    setMessage("방 찾는 중...");

    const code = joinCode.trim().toUpperCase();

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code)
      .single();

    if (roomError || !roomData) {
      setMessage("방을 찾을 수 없어. 코드를 다시 확인해줘.");
      return;
    }

    const foundRoom = roomData as Room;

    if (foundRoom.status !== "waiting") {
      setMessage("이미 시작된 방이야. 지금은 대기 중인 방만 입장 가능.");
      return;
    }

    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .insert({
        room_id: foundRoom.id,
        name: playerName.trim(),
        score: 0,
        is_online: true,
      })
      .select()
      .single();

    if (playerError || !playerData) {
      setMessage(`입장 실패: ${playerError?.message ?? "알 수 없는 오류"}`);
      return;
    }

    const joinedPlayer = playerData as Player;

    localStorage.setItem("roomId", foundRoom.id);
    localStorage.setItem("roomCode", foundRoom.code);
    localStorage.setItem("playerId", joinedPlayer.id);
    localStorage.setItem("playerName", joinedPlayer.name);

    setPlayerId(joinedPlayer.id);
    setMessage("방 입장 성공!");

    await fetchRoomState(foundRoom.id);
  }

  async function startGame() {
    if (!room) return;

    if (!isHost) {
      setMessage("방장만 게임을 시작할 수 있어.");
      return;
    }

    const roundNumber = 1;
    const question = fallbackQuestions[0];

    const now = await getCorrectedServerNow();
    const endsAt = new Date(now.getTime() + 5 * 60 * 1000);

    const { error: roundError } = await supabase.from("rounds").insert({
      room_id: room.id,
      round_number: roundNumber,
      question_json: question,
      answer_json: question.answer,
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "playing",
    });

    if (roundError) {
      setMessage(`라운드 시작 실패: ${roundError.message}`);
      return;
    }

    const { error: roomError } = await supabase
      .from("rooms")
      .update({
        status: "playing",
        current_round: roundNumber,
      })
      .eq("id", room.id);

    if (roomError) {
      setMessage(`방 상태 변경 실패: ${roomError.message}`);
      return;
    }

    setMessage("");
    localStorage.removeItem("currentRoundId");

    await fetchRoomState(room.id);
  }

  async function submitRanking() {
    if (!room || !currentRound) return;

    if (mySubmission) {
      setMessage("이미 제출했어.");
      return;
    }

    if (orderedItems.length !== 5) {
      setMessage("순위가 아직 완성되지 않았어.");
      return;
    }

    setIsSubmitting(true);

    const result = calculateScore(
      currentRound.answer_json,
      orderedItems,
      Number(room.difficulty)
    );

    const { error: submissionError } = await supabase.from("submissions").insert({
      room_id: room.id,
      round_id: currentRound.id,
      player_id: playerId,
      ordered_items_json: orderedItems,
      total_error: result.totalError,
      weighted_error: result.weightedError,
      score_gain: result.scoreGain,
      drink_penalty: result.drinkPenalty,
    });

    if (submissionError) {
      setIsSubmitting(false);
      setMessage(`제출 실패: ${submissionError.message}`);
      return;
    }

    const me = players.find((player) => player.id === playerId);
    const currentScore = me?.score ?? 0;

    await supabase
      .from("players")
      .update({
        score: currentScore + result.scoreGain,
      })
      .eq("id", playerId);

    setIsSubmitting(false);
    setMessage("제출 완료! 친구들을 기다리는 중...");

    await fetchRoomState(room.id);
  }

  async function revealRoundResult() {
    if (!room || !currentRound) return;
    if (room.status !== "playing") return;

    await supabase
      .from("rounds")
      .update({
        status: "result",
      })
      .eq("id", currentRound.id);

    await supabase
      .from("rooms")
      .update({
        status: "result",
      })
      .eq("id", room.id);
  }

  async function startNextRound() {
    if (!room) return;

    if (!isHost) {
      setMessage("방장만 다음 라운드를 시작할 수 있어.");
      return;
    }

    if (room.current_round >= room.max_rounds) {
      await finishGame();
      return;
    }

    const nextRoundNumber = room.current_round + 1;
    const question = fallbackQuestions[(nextRoundNumber - 1) % fallbackQuestions.length];

    const now = await getCorrectedServerNow();
    const endsAt = new Date(now.getTime() + 5 * 60 * 1000);

    const { error: roundError } = await supabase.from("rounds").insert({
      room_id: room.id,
      round_number: nextRoundNumber,
      question_json: question,
      answer_json: question.answer,
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "playing",
    });

    if (roundError) {
      setMessage(`다음 라운드 생성 실패: ${roundError.message}`);
      return;
    }

    const { error: roomError } = await supabase
      .from("rooms")
      .update({
        status: "playing",
        current_round: nextRoundNumber,
      })
      .eq("id", room.id);

    if (roomError) {
      setMessage(`방 상태 변경 실패: ${roomError.message}`);
      return;
    }

    setMessage("");
    setSubmissions([]);
    setOrderedItems([]);
    localStorage.removeItem("currentRoundId");

    await fetchRoomState(room.id);
  }

  async function finishGame() {
    if (!room) return;

    await supabase
      .from("rooms")
      .update({
        status: "finished",
      })
      .eq("id", room.id);

    await fetchRoomState(room.id);
  }

  async function leaveRoom() {
    if (playerId) {
      await supabase
        .from("players")
        .update({
          is_online: false,
        })
        .eq("id", playerId);
    }

    forceReset();
  }

  function moveItem(index: number, direction: "up" | "down") {
    const nextItems = [...orderedItems];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= nextItems.length) return;

    [nextItems[index], nextItems[targetIndex]] = [
      nextItems[targetIndex],
      nextItems[index],
    ];

    setOrderedItems(nextItems);
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-[#080812] text-white flex items-center justify-center p-6">
        <ForceResetButton />

        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
          <p className="text-sm font-bold tracking-[0.2em] text-cyan-300">
            RANKING PARTY
          </p>

          <h1 className="mt-3 text-4xl font-black">친구랑 랭킹 게임</h1>

          <p className="mt-3 text-white/60">
            방을 만들거나 친구가 준 방 코드로 입장합니다.
          </p>

          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="내 이름"
            className="mt-6 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-white outline-none focus:border-cyan-300"
          />

          <button
            onClick={createRoom}
            className="mt-4 w-full rounded-2xl bg-cyan-400 px-5 py-4 font-black text-black"
          >
            방 만들기
          </button>

          <div className="my-6 h-px bg-white/10" />

          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="방 코드 입력"
            maxLength={4}
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-white uppercase outline-none focus:border-pink-300"
          />

          <button
            onClick={joinRoom}
            className="mt-4 w-full rounded-2xl bg-pink-400 px-5 py-4 font-black text-black"
          >
            방 코드로 입장하기
          </button>

          {message && (
            <p className="mt-4 rounded-2xl bg-black/30 p-4 text-sm">
              {message}
            </p>
          )}
        </div>
      </main>
    );
  }

  if (room.status === "waiting") {
    return (
      <main className="min-h-screen bg-[#080812] text-white flex items-center justify-center p-6">
        <ForceResetButton />

        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
          <p className="text-sm font-bold tracking-[0.2em] text-cyan-300">
            WAITING ROOM
          </p>

          <h1 className="mt-3 text-4xl font-black">대기방</h1>

          <div className="mt-5 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-4">
            <p className="text-sm text-white/60">친구에게 줄 방 코드</p>
            <p className="mt-1 text-5xl font-black text-cyan-300">
              {room.code}
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between">
              <p className="font-black">참가자</p>
              <p className="text-sm text-white/50">{players.length}명</p>
            </div>

            <div className="mt-4 space-y-2">
              {players.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3"
                >
                  <div>
                    <p className="font-bold">
                      {index + 1}. {player.name}
                    </p>

                    {player.id === playerId && (
                      <p className="text-xs text-cyan-300">나</p>
                    )}

                    {player.id === room.host_player_id && (
                      <p className="text-xs text-pink-300">방장</p>
                    )}
                  </div>

                  <p className="text-sm text-white/50">{player.score}점</p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={startGame}
            className="mt-5 w-full rounded-2xl bg-cyan-400 px-5 py-4 font-black text-black"
          >
            {isHost ? "게임 시작하기" : "방장이 시작하기를 기다리는 중"}
          </button>

          <button
            onClick={leaveRoom}
            className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 font-bold text-white"
          >
            나가기
          </button>

          {message && (
            <p className="mt-4 rounded-2xl bg-black/30 p-4 text-sm">
              {message}
            </p>
          )}
        </div>
      </main>
    );
  }

  if (room.status === "playing" && currentRound) {
    return (
      <main className="min-h-screen bg-[#080812] text-white flex items-center justify-center p-6">
        <ForceResetButton />

        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.2em] text-cyan-300">
                ROUND {room.current_round} / {room.max_rounds}
              </p>

              <h1 className="mt-3 text-3xl font-black">
                {currentRound.question_json.title}
              </h1>

              <p className="mt-2 text-sm text-white/50">
                {currentRound.question_json.source}
              </p>
            </div>

            <div className="rounded-2xl border border-pink-300/30 bg-pink-300/10 px-4 py-3 text-right">
              <p className="text-xs text-white/50">남은 시간</p>
              <p className="text-2xl font-black text-pink-300">
                {formatTime(remainingSeconds)}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {orderedItems.map((item, index) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-3"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 font-black text-cyan-300">
                  {index + 1}
                </div>

                <p className="flex-1 font-black">{item}</p>

                <button
                  onClick={() => moveItem(index, "up")}
                  disabled={Boolean(mySubmission) || index === 0}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold disabled:opacity-30"
                >
                  ↑
                </button>

                <button
                  onClick={() => moveItem(index, "down")}
                  disabled={Boolean(mySubmission) || index === orderedItems.length - 1}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={submitRanking}
            disabled={Boolean(mySubmission) || isSubmitting}
            className="mt-5 w-full rounded-2xl bg-cyan-400 px-5 py-4 font-black text-black disabled:opacity-40"
          >
            {mySubmission ? "제출 완료" : isSubmitting ? "제출 중..." : "제출하기"}
          </button>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex justify-between">
              <p className="font-black">제출 현황</p>
              <p className="text-white/50">
                {submissions.length} / {players.length}
              </p>
            </div>

            <div className="mt-3 space-y-2">
              {players.map((player) => {
                const done = submissions.some(
                  (submission) => submission.player_id === player.id
                );

                return (
                  <div
                    key={player.id}
                    className="flex justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"
                  >
                    <span>{player.name}</span>
                    <span className={done ? "text-cyan-300" : "text-white/40"}>
                      {done ? "제출 완료" : "대기 중"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {message && (
            <p className="mt-4 rounded-2xl bg-black/30 p-4 text-sm">
              {message}
            </p>
          )}
        </div>
      </main>
    );
  }

  if (room.status === "result" && currentRound) {
    const roundSubmissions = submissions
      .map((submission) => {
        const player = players.find((item) => item.id === submission.player_id);

        return {
          ...submission,
          playerName: player?.name ?? "알 수 없음",
        };
      })
      .sort((a, b) => b.score_gain - a.score_gain);

    return (
      <main className="min-h-screen bg-[#080812] text-white flex items-center justify-center p-6">
        <ForceResetButton />

        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
          <p className="text-sm font-bold tracking-[0.2em] text-cyan-300">
            ROUND RESULT
          </p>

          <h1 className="mt-3 text-4xl font-black">
            {room.current_round}라운드 결과
          </h1>

          <div className="mt-6 space-y-3">
            {roundSubmissions.map((submission, index) => (
              <div
                key={submission.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xl font-black">
                    {index + 1}. {submission.playerName}
                  </p>

                  <p className="text-2xl font-black text-cyan-300">
                    +{submission.score_gain}
                  </p>
                </div>

                <p className="mt-2 text-sm text-white/60">
                  오차 {submission.total_error} · 가중 오차{" "}
                  {submission.weighted_error} · 벌칙 {submission.drink_penalty}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-black">현재 총점</p>

            <div className="mt-3 space-y-2">
              {sortedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className="flex justify-between rounded-xl bg-white/5 px-3 py-2"
                >
                  <span>
                    {index + 1}. {player.name}
                  </span>

                  <span className="font-black text-cyan-300">
                    {player.score}점
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={startNextRound}
            className="mt-5 w-full rounded-2xl bg-pink-400 px-5 py-4 font-black text-black"
          >
            {isHost
              ? room.current_round >= room.max_rounds
                ? "최종 결과 보기"
                : "다음 라운드 시작"
              : "방장이 다음 라운드를 시작하기를 기다리는 중"}
          </button>

          {message && (
            <p className="mt-4 rounded-2xl bg-black/30 p-4 text-sm">
              {message}
            </p>
          )}
        </div>
      </main>
    );
  }

  if (room.status === "finished") {
    return (
      <main className="min-h-screen bg-[#080812] text-white flex items-center justify-center p-6">
        <ForceResetButton />

        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/10 p-6 text-center backdrop-blur-xl">
          <p className="text-sm font-bold tracking-[0.2em] text-cyan-300">
            FINAL RESULT
          </p>

          <h1 className="mt-3 text-5xl font-black">최종 결과</h1>

          <div className="mt-8 space-y-3 text-left">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`rounded-2xl border p-4 ${
                  index === 0
                    ? "border-yellow-300/40 bg-yellow-300/10"
                    : "border-white/10 bg-black/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xl font-black">
                    {index === 0 ? "👑 " : ""}
                    {index + 1}. {player.name}
                  </p>

                  <p className="text-2xl font-black text-cyan-300">
                    {player.score}점
                  </p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={leaveRoom}
            className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-4 font-black text-black"
          >
            처음으로
          </button>
        </div>
      </main>
    );
  }

  return null;
}