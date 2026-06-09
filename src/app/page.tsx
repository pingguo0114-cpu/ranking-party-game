"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabase";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type RoomStatus = "waiting" | "playing" | "result" | "finished";
type RoundStatus = "playing" | "result" | "done";
type QuestionCategory = "all" | "food" | "dating" | "work" | "friends";
type SourceType = "sample" | "real";

type Room = {
  id: string;
  code: string;
  host_player_id: string | null;
  status: RoomStatus;
  current_round: number;
  max_rounds: number;
  difficulty: number;
  selected_category: QuestionCategory;
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
  id: string;
  category: Exclude<QuestionCategory, "all">;
  title: string;
  source: string;
  sourceType: SourceType;
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

const categoryOptions: {
  value: QuestionCategory;
  label: string;
  description: string;
}[] = [
  {
    value: "all",
    label: "전체 랜덤",
    description: "모든 주제에서 랜덤",
  },
  {
    value: "food",
    label: "음식/취향",
    description: "야식, 배달, 스트레스 음식",
  },
  {
    value: "dating",
    label: "연애/관계",
    description: "소개팅, 호감, 연락",
  },
  {
    value: "work",
    label: "직장/사회생활",
    description: "동료, 회사, 사회생활",
  },
  {
    value: "friends",
    label: "술자리/친구",
    description: "친구, 술자리, 노래방",
  },
];

const fallbackQuestions: Question[] = [
  {
    id: "food_night_01",
    category: "food",
    title: "한국인이 좋아하는 야식 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: ["치킨", "라면", "족발/보쌈", "떡볶이", "피자"],
  },
  {
    id: "food_delivery_01",
    category: "food",
    title: "한국인이 선호하는 배달음식 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: ["치킨", "중식", "피자", "분식", "족발/보쌈"],
  },
  {
    id: "food_stress_01",
    category: "food",
    title: "스트레스 받을 때 먹고 싶은 음식 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: ["매운 음식", "치킨", "떡볶이", "디저트", "라면"],
  },
  {
    id: "dating_blind_date_01",
    category: "dating",
    title: "소개팅에서 호감 떨어지는 행동 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: [
      "무례한 말투",
      "계속 휴대폰 보기",
      "전 연인 이야기",
      "일방적인 자기 자랑",
      "계산 매너 없음",
    ],
  },
  {
    id: "dating_reply_01",
    category: "dating",
    title: "카톡 답장이 늦어지는 이유 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: [
      "바빠서",
      "뭐라고 답할지 몰라서",
      "귀찮아서",
      "알림을 못 봐서",
      "일부러 시간을 두려고",
    ],
  },
  {
    id: "work_coworker_01",
    category: "work",
    title: "직장인이 뽑은 꼴불견 동료 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: [
      "남 탓하는 사람",
      "말만 하고 일 안 하는 사람",
      "지각이 잦은 사람",
      "뒷담화하는 사람",
      "공을 가로채는 사람",
    ],
  },
  {
    id: "friends_drinking_01",
    category: "friends",
    title: "술자리에서 분위기 깨는 행동 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: [
      "계속 휴대폰만 보기",
      "술 강요하기",
      "혼자 진지한 얘기만 하기",
      "계산할 때 사라지기",
      "같은 말 반복하기",
    ],
  },
  {
    id: "friends_hurt_01",
    category: "friends",
    title: "친구에게 가장 서운한 순간 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: [
      "약속을 쉽게 취소할 때",
      "내 얘기를 안 들을 때",
      "연락을 일부러 늦게 볼 때",
      "돈 문제로 애매하게 굴 때",
      "비밀을 말했을 때",
    ],
  },
  {
    id: "friends_karaoke_01",
    category: "friends",
    title: "노래방에서 자주 부르는 장르 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: ["발라드", "댄스곡", "아이돌 노래", "힙합", "트로트"],
  },
  {
    id: "food_travel_01",
    category: "food",
    title: "여행 가서 가장 먼저 하는 일 Top 5",
    source: "게임용 샘플 랭킹",
    sourceType: "sample",
    answer: ["숙소 체크인", "맛집 찾기", "사진 찍기", "카페 가기", "기념품 구경"],
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

function getCategoryLabel(category: QuestionCategory) {
  return categoryOptions.find((option) => option.value === category)?.label ?? "전체 랜덤";
}

function getQuestionPool(category: QuestionCategory) {
  if (category === "all") return fallbackQuestions;
  return fallbackQuestions.filter((question) => question.category === category);
}

async function getRandomUnusedQuestion(roomId: string, category: QuestionCategory) {
  const basePool = getQuestionPool(category);
  const safeBasePool = basePool.length > 0 ? basePool : fallbackQuestions;

  const { data: rounds, error } = await supabase
    .from("rounds")
    .select("question_json")
    .eq("room_id", roomId);

  if (error) {
    console.warn("Question history fetch failed:", error);
    return safeBasePool[Math.floor(Math.random() * safeBasePool.length)];
  }

  const usedIds = new Set(
    (rounds ?? [])
      .map((round) => {
        const question = round.question_json as Question;
        return question.id;
      })
      .filter(Boolean)
  );

  const unusedQuestions = safeBasePool.filter(
    (question) => !usedIds.has(question.id)
  );

  const pool = unusedQuestions.length > 0 ? unusedQuestions : safeBasePool;
  const randomIndex = Math.floor(Math.random() * pool.length);

  return pool[randomIndex];
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

type SortableRankingItemProps = {
  item: string;
  index: number;
  disabled: boolean;
};

function SortableRankingItem({ item, index, disabled }: SortableRankingItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex touch-none items-center gap-3 rounded-2xl border p-3 transition ${
        isDragging
          ? "z-50 scale-[1.03] border-pink-300/60 bg-pink-300/20 shadow-[0_0_30px_rgba(255,43,214,.45)]"
          : "border-white/10 bg-black/30"
      }`}
    >
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 font-black text-cyan-300">
        {index + 1}
      </div>

      <p className="flex-1 font-black">{item}</p>

      <div className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white/60">
        드래그
      </div>
    </div>
  );
}

function ForceResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      className="fixed right-4 top-4 z-50 rounded-2xl border border-white/10 bg-black/70 px-4 py-3 text-sm font-bold text-white backdrop-blur-xl"
    >
      초기화
    </button>
  );
}

function CategorySelector({
  disabled = false,
  roomCategory,
  selectedCategory,
  onChange,
}: {
  disabled?: boolean;
  roomCategory: QuestionCategory;
  selectedCategory: QuestionCategory;
  onChange: (category: QuestionCategory) => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-black">카테고리</p>
          <p className="mt-1 text-xs text-white/50">
            {disabled
              ? "방장이 선택한 주제로 진행돼요"
              : "이번 게임의 문제 범위를 고르세요"}
          </p>
        </div>

        <p className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-200">
          {getCategoryLabel(roomCategory)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {categoryOptions.map((option) => {
          const active = selectedCategory === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                active
                  ? "border-cyan-300/60 bg-cyan-300/15"
                  : "border-white/10 bg-white/5"
              } ${disabled ? "cursor-not-allowed opacity-70" : "hover:bg-white/10"}`}
            >
              <p className="font-black">{option.label}</p>
              <p className="mt-1 text-xs text-white/50">{option.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GameApp() {
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<QuestionCategory>("all");

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState<GameRound | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const [playerId, setPlayerId] = useState("");
  const [orderedItems, setOrderedItems] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [nowMs, setNowMs] = useState(0);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8,
      },
    })
  );

  const isHost = room?.host_player_id === playerId;

  const mySubmission = useMemo(() => {
    return submissions.find((submission) => submission.player_id === playerId) ?? null;
  }, [submissions, playerId]);

  const remainingSeconds = currentRound?.ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(currentRound.ends_at).getTime() - (nowMs + serverTimeOffset)) /
            1000
        )
      )
    : 0;

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
      setIsSubmitting(false);

      return;
    }

    const typedRoom = roomData as Room;
    setRoom(typedRoom);
    setSelectedCategory(typedRoom.selected_category ?? "all");

    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", targetRoomId)
      .order("joined_at", { ascending: true });

    if (playerError) {
      console.warn("Players fetch failed:", playerError);
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
        console.warn("Round fetch failed:", roundError);
        return;
      }

      if (!roundData) {
        setCurrentRound(null);
        setSubmissions([]);
        setOrderedItems([]);
        localStorage.removeItem("currentRoundId");
        setMessage(
          "현재 라운드 정보를 찾을 수 없습니다. 방 데이터가 오래되었거나 라운드가 삭제되었습니다. 초기화 후 새 방을 만들어 주세요."
        );
        return;
      }

      const typedRound = roundData as GameRound;
      setCurrentRound(typedRound);

      const { data: submissionData, error: submissionError } = await supabase
        .from("submissions")
        .select("*")
        .eq("round_id", typedRound.id);

      if (submissionError) {
        console.warn("Submissions fetch failed:", submissionError);
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

  const syncServerTime = useCallback(async () => {
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
  }, []);

  async function getCorrectedServerNow() {
    const startedAt = Date.now();

    const { data, error } = await supabase.rpc("get_server_time");

    const endedAt = Date.now();

    if (error || !data) {
      console.warn("Server time fetch failed:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        raw: error,
      });

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

  async function updateRoomCategory(nextCategory: QuestionCategory) {
    setSelectedCategory(nextCategory);

    if (!room || !isHost || room.status !== "waiting") return;

    const { error } = await supabase
      .from("rooms")
      .update({
        selected_category: nextCategory,
      })
      .eq("id", room.id);

    if (error) {
      setMessage(`카테고리 변경 실패: ${error.message}`);
      return;
    }

    await fetchRoomState(room.id);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldReset = params.get("reset") === "1";

    if (shouldReset) {
      localStorage.clear();

      queueMicrotask(() => {
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
      });

      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    const savedRoomId = localStorage.getItem("roomId");
    const savedPlayerId = localStorage.getItem("playerId");
    const savedPlayerName = localStorage.getItem("playerName");

    if (savedRoomId && savedPlayerId) {
      queueMicrotask(() => {
        setPlayerId(savedPlayerId);
        setPlayerName(savedPlayerName ?? "");
        fetchRoomState(savedRoomId);
      });
    }
  }, [fetchRoomState]);

  useEffect(() => {
    const updateNow = () => {
      setNowMs(Date.now());
    };

    queueMicrotask(updateNow);

    const timer = setInterval(updateNow, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      syncServerTime();
    });

    const timer = setInterval(() => {
      syncServerTime();
    }, 30000);

    return () => clearInterval(timer);
  }, [syncServerTime]);

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
        selected_category: "all",
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
    const question = await getRandomUnusedQuestion(room.id, room.selected_category ?? "all");

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

  const revealRoundResult = useCallback(async () => {
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
  }, [currentRound, room]);

  useEffect(() => {
    if (!room || !currentRound) return;
    if (room.status !== "playing") return;
    if (players.length === 0) return;

    const allSubmitted = submissions.length >= players.length;
    const timeEnded = remainingSeconds <= 0;

    if ((allSubmitted || timeEnded) && isHost) {
      revealRoundResult();
    }
  }, [
    room,
    currentRound,
    players.length,
    submissions.length,
    remainingSeconds,
    isHost,
    revealRoundResult,
  ]);

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
    const question = await getRandomUnusedQuestion(room.id, room.selected_category ?? "all");

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over) return;
    if (active.id === over.id) return;

    setOrderedItems((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));

      if (oldIndex === -1 || newIndex === -1) return items;

      return arrayMove(items, oldIndex, newIndex);
    });
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-[#080812] text-white flex items-center justify-center p-6">
        <ForceResetButton onReset={forceReset} />

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
        <ForceResetButton onReset={forceReset} />

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

          <CategorySelector
            disabled={!isHost}
            roomCategory={room.selected_category ?? "all"}
            selectedCategory={selectedCategory}
            onChange={updateRoomCategory}
          />

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
        <ForceResetButton onReset={forceReset} />

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
                {getCategoryLabel(currentRound.question_json.category)} ·{" "}
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

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedItems}
              strategy={verticalListSortingStrategy}
            >
              <div className="mt-6 space-y-3">
                {orderedItems.map((item, index) => (
                  <SortableRankingItem
                    key={item}
                    item={item}
                    index={index}
                    disabled={Boolean(mySubmission)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

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

    const penaltyTarget = [...roundSubmissions].sort((a, b) => {
      if (a.score_gain !== b.score_gain) {
        return a.score_gain - b.score_gain;
      }

      if (a.total_error !== b.total_error) {
        return b.total_error - a.total_error;
      }

      return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
    })[0];

    const questionSourceLabel =
      currentRound.question_json.sourceType === "real"
        ? "실제 설문/자료 기반"
        : "게임용 샘플 랭킹";

    return (
      <main className="min-h-screen bg-[#080812] text-white flex items-center justify-center p-6">
        <ForceResetButton onReset={forceReset} />

        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
          <p className="text-sm font-bold tracking-[0.2em] text-cyan-300">
            ROUND RESULT
          </p>

          <h1 className="mt-3 text-4xl font-black">
            {room.current_round}라운드 결과
          </h1>

          {penaltyTarget && (
            <div className="relative mt-6 overflow-hidden rounded-3xl border border-pink-300/40 bg-pink-500/15 p-6 text-center shadow-[0_0_45px_rgba(255,43,214,.35)]">
              <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-400/20 animate-ping" />

              <div className="relative">
                <p className="text-sm font-black tracking-[0.25em] text-pink-200">
                  💥 벌칙 당첨 💥
                </p>

                <p className="mt-3 text-5xl font-black text-white">
                  {penaltyTarget.playerName}
                </p>

                <p className="mt-3 text-3xl font-black text-pink-300">
                  벌칙주 한 잔
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-cyan-200">
                  정답 공개
                </p>
                <p className="mt-1 text-sm text-white/60">
                  {questionSourceLabel} · {currentRound.question_json.source}
                </p>
              </div>

              <p className="rounded-full bg-black/30 px-3 py-1 text-xs font-black text-cyan-200">
                {getCategoryLabel(currentRound.question_json.category)}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              {currentRound.answer_json.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className="flex items-center gap-3 rounded-2xl bg-black/25 px-4 py-3"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/15 font-black text-cyan-200">
                    {index + 1}
                  </div>

                  <p className="font-black">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {roundSubmissions.map((submission, index) => (
              <div
                key={submission.id}
                className={`rounded-2xl border p-4 ${
                  penaltyTarget?.player_id === submission.player_id
                    ? "border-pink-300/40 bg-pink-400/10"
                    : "border-white/10 bg-black/30"
                }`}
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
                  {submission.weighted_error}
                </p>

                {penaltyTarget?.player_id === submission.player_id && (
                  <p className="mt-2 inline-flex rounded-full bg-pink-400/20 px-3 py-1 text-sm font-black text-pink-200">
                    벌칙주 한 잔
                  </p>
                )}
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
        <ForceResetButton onReset={forceReset} />

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

  return (
    <main className="min-h-screen bg-[#080812] text-white flex items-center justify-center p-6">
      <ForceResetButton onReset={forceReset} />

      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
        <p className="text-sm font-bold tracking-[0.2em] text-pink-300">
          RECOVERY
        </p>

        <h1 className="mt-3 text-3xl font-black">게임 상태를 복구할 수 없습니다</h1>

        <p className="mt-3 leading-7 text-white/70">
          저장된 방 상태와 라운드 데이터가 맞지 않습니다. 초기화 후 새로 입장해 주세요.
        </p>

        {message && (
          <p className="mt-4 rounded-2xl bg-black/30 p-4 text-sm text-white/80">
            {message}
          </p>
        )}

        <button
          onClick={forceReset}
          className="mt-5 w-full rounded-2xl bg-cyan-400 px-5 py-4 font-black text-black"
        >
          초기화하고 처음으로
        </button>
      </div>
    </main>
  );
}

export default function Home() {
  if (supabaseConfigError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080812] p-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
          <p className="text-sm font-bold tracking-[0.2em] text-pink-300">
            CONFIG ERROR
          </p>
          <h1 className="mt-3 text-3xl font-black">Supabase 설정 필요</h1>
          <p className="mt-3 leading-7 text-white/70">{supabaseConfigError}</p>
        </div>
      </main>
    );
  }

  return <GameApp />;
}
